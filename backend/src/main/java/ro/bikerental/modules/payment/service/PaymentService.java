package ro.bikerental.modules.payment.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.currency.SupportedCurrency;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;
import ro.bikerental.modules.customer.entity.Customer;
import ro.bikerental.modules.customer.repository.CustomerRepository;
import ro.bikerental.modules.payment.dto.*;
import ro.bikerental.modules.payment.entity.*;
import ro.bikerental.modules.payment.repository.PaymentAllocationRepository;
import ro.bikerental.modules.payment.repository.PaymentRepository;
import ro.bikerental.modules.payment.repository.PaymentReversalRepository;
import ro.bikerental.modules.rental.entity.ChargeStatus;
import ro.bikerental.modules.rental.entity.Rental;
import ro.bikerental.modules.rental.entity.RentalCharge;
import ro.bikerental.modules.rental.repository.RentalChargeRepository;
import ro.bikerental.modules.rental.repository.RentalRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;
    private final PaymentReversalRepository paymentReversalRepository;
    private final CustomerRepository customerRepository;
    private final RentalRepository rentalRepository;
    private final RentalChargeRepository rentalChargeRepository;
    private final AppUserRepository appUserRepository;

    public PaymentService(PaymentRepository paymentRepository,
                          PaymentAllocationRepository paymentAllocationRepository,
                          PaymentReversalRepository paymentReversalRepository,
                          CustomerRepository customerRepository,
                          RentalRepository rentalRepository,
                          RentalChargeRepository rentalChargeRepository,
                          AppUserRepository appUserRepository) {
        this.paymentRepository = paymentRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
        this.paymentReversalRepository = paymentReversalRepository;
        this.customerRepository = customerRepository;
        this.rentalRepository = rentalRepository;
        this.rentalChargeRepository = rentalChargeRepository;
        this.appUserRepository = appUserRepository;
    }

    @Transactional
    public PaymentDto recordPayment(RecordPaymentRequest request, UUID userId) {
        Customer customer = customerRepository.findById(request.getCustomerId())
                .orElseThrow(() -> new ResourceNotFoundException("Customer", request.getCustomerId()));

        if (!SupportedCurrency.isValid(request.getCurrency())) {
            throw new BusinessException("Unsupported currency: " + request.getCurrency());
        }
        String currency = request.getCurrency().toUpperCase().trim();

        Rental rental = null;
        if (request.getRentalId() != null) {
            rental = rentalRepository.findById(request.getRentalId())
                    .orElseThrow(() -> new ResourceNotFoundException("Rental agreement", request.getRentalId()));
            if (!rental.getCustomer().getId().equals(customer.getId())) {
                throw new BusinessException("Rental agreement does not belong to customer: " + customer.getId());
            }
        }

        AppUser user;
        if (userId != null) {
            user = appUserRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        } else {
            user = appUserRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new BusinessException("No user found in system to record payment"));
        }

        Payment payment = new Payment(
                customer,
                rental,
                request.getPaymentDate(),
                request.getAmount(),
                currency,
                request.getPaymentMethod(),
                request.getReferenceNumber(),
                request.getNotes(),
                user
        );

        Payment savedPayment = paymentRepository.save(payment);

        if ("MANUAL".equalsIgnoreCase(request.getAllocationMode())) {
            allocateManually(savedPayment, customer, currency, request);
        } else {
            allocateAutoFifo(savedPayment, customer, rental, currency, request.getAmount());
        }

        return PaymentDto.fromEntity(savedPayment, null);
    }

    private void allocateAutoFifo(Payment payment, Customer customer, Rental rental, String currency, BigDecimal amount) {
        List<RentalCharge> pendingCharges;
        if (rental != null) {
            pendingCharges = rentalChargeRepository.findAllByRentalIdAndStatusInOrderByDueDateAsc(
                    rental.getId(), List.of(ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID)
            ).stream()
             .filter(c -> c.getCurrency().equalsIgnoreCase(currency))
             .collect(Collectors.toList());
        } else {
            pendingCharges = rentalChargeRepository.findAllByRentalCustomerIdAndCurrencyAndStatusInOrderByDueDateAsc(
                    customer.getId(), currency, List.of(ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID)
            );
        }

        BigDecimal remainingToAllocate = amount;
        for (RentalCharge charge : pendingCharges) {
            if (remainingToAllocate.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }

            BigDecimal paidSoFar = paymentAllocationRepository.sumAllocatedForCharge(charge.getId());
            if (paidSoFar == null) {
                paidSoFar = BigDecimal.ZERO;
            }

            BigDecimal unpaidOnCharge = charge.getAmount().subtract(paidSoFar);
            if (unpaidOnCharge.compareTo(BigDecimal.ZERO) <= 0) {
                charge.setStatus(ChargeStatus.PAID);
                rentalChargeRepository.save(charge);
                continue;
            }

            BigDecimal allocAmount = remainingToAllocate.min(unpaidOnCharge);
            PaymentAllocation allocation = new PaymentAllocation(payment, charge, allocAmount, currency);
            payment.getAllocations().add(allocation);
            paymentAllocationRepository.save(allocation);

            remainingToAllocate = remainingToAllocate.subtract(allocAmount);

            BigDecimal totalPaidAfter = paidSoFar.add(allocAmount);
            if (totalPaidAfter.compareTo(charge.getAmount()) >= 0) {
                charge.setStatus(ChargeStatus.PAID);
            } else {
                charge.setStatus(ChargeStatus.PARTIALLY_PAID);
            }
            rentalChargeRepository.save(charge);
        }
    }

    private void allocateManually(Payment payment, Customer customer, String currency, RecordPaymentRequest request) {
        if (request.getManualAllocations() == null || request.getManualAllocations().isEmpty()) {
            return;
        }

        BigDecimal totalManual = request.getManualAllocations().stream()
                .map(ManualAllocationItem::getAllocatedAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (totalManual.compareTo(payment.getAmount()) > 0) {
            throw new BusinessException("Total allocated amount (" + totalManual + ") cannot exceed payment amount (" + payment.getAmount() + ")");
        }

        for (ManualAllocationItem item : request.getManualAllocations()) {
            if (item.getAllocatedAmount() == null || item.getAllocatedAmount().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Allocated amount must be positive");
            }

            RentalCharge charge = rentalChargeRepository.findById(item.getRentalChargeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Rental charge", item.getRentalChargeId()));

            if (!charge.getRental().getCustomer().getId().equals(customer.getId())) {
                throw new BusinessException("Charge " + charge.getId() + " does not belong to customer " + customer.getId());
            }

            if (!charge.getCurrency().equalsIgnoreCase(currency)) {
                throw new BusinessException("Currency mismatch: payment currency " + currency + " does not match charge currency " + charge.getCurrency());
            }

            BigDecimal paidSoFar = paymentAllocationRepository.sumAllocatedForCharge(charge.getId());
            if (paidSoFar == null) {
                paidSoFar = BigDecimal.ZERO;
            }

            BigDecimal unpaid = charge.getAmount().subtract(paidSoFar);
            if (item.getAllocatedAmount().compareTo(unpaid) > 0) {
                throw new BusinessException("Allocation amount " + item.getAllocatedAmount() + " exceeds unpaid balance " + unpaid + " for charge " + charge.getId());
            }

            PaymentAllocation allocation = new PaymentAllocation(payment, charge, item.getAllocatedAmount(), currency);
            payment.getAllocations().add(allocation);
            paymentAllocationRepository.save(allocation);

            BigDecimal totalPaidAfter = paidSoFar.add(item.getAllocatedAmount());
            if (totalPaidAfter.compareTo(charge.getAmount()) >= 0) {
                charge.setStatus(ChargeStatus.PAID);
            } else {
                charge.setStatus(ChargeStatus.PARTIALLY_PAID);
            }
            rentalChargeRepository.save(charge);
        }
    }

    @Transactional
    public PaymentDto reversePayment(UUID paymentId, ReversePaymentRequest request, UUID userId) {
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment", paymentId));

        if (payment.getStatus() == PaymentStatus.REVERSED) {
            throw new BusinessException("Payment is already reversed");
        }

        AppUser user;
        if (userId != null) {
            user = appUserRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        } else {
            user = appUserRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new BusinessException("No user found in system to reverse payment"));
        }

        payment.setStatus(PaymentStatus.REVERSED);
        paymentRepository.save(payment);

        for (PaymentAllocation allocation : payment.getAllocations()) {
            RentalCharge charge = allocation.getRentalCharge();

            BigDecimal remainingPaid = paymentAllocationRepository.sumAllocatedForCharge(charge.getId());
            if (remainingPaid == null) {
                remainingPaid = BigDecimal.ZERO;
            }

            if (remainingPaid.compareTo(BigDecimal.ZERO) == 0) {
                charge.setStatus(ChargeStatus.UNPAID);
            } else if (remainingPaid.compareTo(charge.getAmount()) < 0) {
                charge.setStatus(ChargeStatus.PARTIALLY_PAID);
            } else {
                charge.setStatus(ChargeStatus.PAID);
            }
            rentalChargeRepository.save(charge);
        }

        PaymentReversal reversal = new PaymentReversal(payment, request.getReason(), user);
        PaymentReversal savedReversal = paymentReversalRepository.save(reversal);

        return PaymentDto.fromEntity(payment, savedReversal);
    }

    @Transactional(readOnly = true)
    public PaymentDto getPaymentById(UUID id) {
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Payment", id));
        PaymentReversal reversal = paymentReversalRepository.findByPaymentId(id).orElse(null);
        return PaymentDto.fromEntity(payment, reversal);
    }

    @Transactional(readOnly = true)
    public PageResponse<PaymentDto> searchPayments(PaymentStatus status, String currency, PaymentMethod method,
                                                   UUID customerId, LocalDate startDate, LocalDate endDate,
                                                   Pageable pageable) {
        Page<Payment> page = paymentRepository.searchPayments(status, currency, method, customerId, startDate, endDate, pageable);
        List<PaymentDto> dtos = page.getContent().stream()
                .map(p -> {
                    PaymentReversal reversal = p.getStatus() == PaymentStatus.REVERSED
                            ? paymentReversalRepository.findByPaymentId(p.getId()).orElse(null)
                            : null;
                    return PaymentDto.fromEntity(p, reversal);
                })
                .collect(Collectors.toList());
        return new PageResponse<>(dtos, page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isLast());
    }

    @Transactional(readOnly = true)
    public List<PaymentDto> getPaymentsForCustomer(UUID customerId) {
        List<Payment> payments = paymentRepository.findAllByCustomerIdOrderByPaymentDateDesc(customerId);
        return payments.stream()
                .map(p -> PaymentDto.fromEntity(p, null))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<PaymentDto> getPaymentsForRental(UUID rentalId) {
        List<Payment> payments = paymentRepository.findAllByRentalIdOrderByPaymentDateDesc(rentalId);
        return payments.stream()
                .map(p -> PaymentDto.fromEntity(p, null))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public CustomerBalanceSummaryDto getCustomerBalanceSummary(UUID customerId) {
        Customer customer = customerRepository.findById(customerId)
                .orElseThrow(() -> new ResourceNotFoundException("Customer", customerId));

        CustomerBalanceSummaryDto summary = new CustomerBalanceSummaryDto(customer.getId(), customer.getFullName());

        List<Object[]> billedRows = rentalChargeRepository.sumChargesByCustomerGroupedByCurrency(customerId);
        for (Object[] row : billedRows) {
            String curr = ((String) row[0]).toUpperCase();
            BigDecimal billed = (BigDecimal) row[1];
            if (summary.getBalances().containsKey(curr)) {
                summary.getBalances().get(curr).setTotalBilled(billed);
            }
        }

        List<Object[]> paidRows = paymentRepository.sumConfirmedPaymentsByCustomerGroupedByCurrency(customerId);
        for (Object[] row : paidRows) {
            String curr = ((String) row[0]).toUpperCase();
            BigDecimal paid = (BigDecimal) row[1];
            if (summary.getBalances().containsKey(curr)) {
                summary.getBalances().get(curr).setTotalPaid(paid);
            }
        }

        for (CustomerBalanceSummaryDto.CurrencyBalanceDto balanceDto : summary.getBalances().values()) {
            BigDecimal diff = balanceDto.getTotalBilled().subtract(balanceDto.getTotalPaid());
            balanceDto.setTotalOutstanding(diff.compareTo(BigDecimal.ZERO) > 0 ? diff : BigDecimal.ZERO);
        }

        return summary;
    }
}

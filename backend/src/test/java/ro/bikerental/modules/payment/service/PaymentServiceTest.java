package ro.bikerental.modules.payment.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.customer.entity.Customer;
import ro.bikerental.modules.customer.repository.CustomerRepository;
import ro.bikerental.modules.payment.dto.CustomerBalanceSummaryDto;
import ro.bikerental.modules.payment.dto.ManualAllocationItem;
import ro.bikerental.modules.payment.dto.PaymentDto;
import ro.bikerental.modules.payment.dto.RecordPaymentRequest;
import ro.bikerental.modules.payment.dto.ReversePaymentRequest;
import ro.bikerental.modules.payment.entity.Payment;
import ro.bikerental.modules.payment.entity.PaymentAllocation;
import ro.bikerental.modules.payment.entity.PaymentMethod;
import ro.bikerental.modules.payment.entity.PaymentStatus;
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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private PaymentAllocationRepository paymentAllocationRepository;

    @Mock
    private PaymentReversalRepository paymentReversalRepository;

    @Mock
    private CustomerRepository customerRepository;

    @Mock
    private RentalRepository rentalRepository;

    @Mock
    private RentalChargeRepository rentalChargeRepository;

    @Mock
    private AppUserRepository appUserRepository;

    private PaymentService paymentService;

    private Customer sampleCustomer;
    private AppUser sampleUser;
    private Rental sampleRental;

    @BeforeEach
    void setUp() {
        paymentService = new PaymentService(
                paymentRepository,
                paymentAllocationRepository,
                paymentReversalRepository,
                customerRepository,
                rentalRepository,
                rentalChargeRepository,
                appUserRepository
        );

        sampleCustomer = new Customer("Andrei Vasilescu", "+40721234567", "andrei@email.ro", "1940512123456", "B00123456Z", "A,B", LocalDate.of(2030, 1, 1), "Bucuresti", LocalDate.now(), null);
        sampleCustomer.setId(UUID.randomUUID());

        sampleUser = new AppUser("admin@bikerental.ro", "secret", "Business Owner", "ROLE_OWNER", "en");
        sampleUser.setId(UUID.randomUUID());

        Bike bike = new Bike("B 123 BIK", "JH2PC37053M000001", "Honda", "PCX 125", 2024, BigDecimal.valueOf(1000), LocalDate.now().plusYears(1), LocalDate.now().plusMonths(6), null, ro.bikerental.modules.bike.entity.BikeStatus.AVAILABLE, null);
        sampleRental = new Rental(sampleCustomer, bike, LocalDate.of(2026, 10, 1), null, BigDecimal.valueOf(300), "RON", null, null, null, null);
        sampleRental.setId(UUID.randomUUID());
    }

    @Test
    @DisplayName("AUTO-FIFO: Should allocate payment across multiple charges in chronological due date order")
    void recordPayment_autoFifo_allocatesChronologically() {
        RentalCharge charge1 = new RentalCharge(sampleRental, 1,
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 1),
                BigDecimal.valueOf(300.00), "RON", "Charge 1");
        charge1.setId(UUID.randomUUID());

        RentalCharge charge2 = new RentalCharge(sampleRental, 2,
                LocalDate.of(2026, 10, 8), LocalDate.of(2026, 10, 14), LocalDate.of(2026, 10, 8),
                BigDecimal.valueOf(300.00), "RON", "Charge 2");
        charge2.setId(UUID.randomUUID());

        RecordPaymentRequest request = new RecordPaymentRequest(
                sampleCustomer.getId(),
                null,
                LocalDate.of(2026, 10, 10),
                BigDecimal.valueOf(450.00),
                "RON",
                PaymentMethod.CASH,
                "REC-001",
                "Cash rent payment",
                "AUTO_FIFO",
                null
        );

        when(customerRepository.findById(sampleCustomer.getId())).thenReturn(Optional.of(sampleCustomer));
        when(appUserRepository.findById(sampleUser.getId())).thenReturn(Optional.of(sampleUser));
        when(rentalChargeRepository.findAllByRentalCustomerIdAndCurrencyAndStatusInOrderByDueDateAsc(
                eq(sampleCustomer.getId()), eq("RON"), any()))
                .thenReturn(List.of(charge1, charge2));

        when(paymentAllocationRepository.sumAllocatedForCharge(charge1.getId())).thenReturn(BigDecimal.ZERO);
        when(paymentAllocationRepository.sumAllocatedForCharge(charge2.getId())).thenReturn(BigDecimal.ZERO);

        when(paymentRepository.save(any(Payment.class))).thenAnswer(i -> {
            Payment p = i.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        PaymentDto result = paymentService.recordPayment(request, sampleUser.getId());

        assertThat(result).isNotNull();
        assertThat(result.getAmount()).isEqualByComparingTo(BigDecimal.valueOf(450.00));
        assertThat(result.getStatus()).isEqualTo(PaymentStatus.CONFIRMED);

        ArgumentCaptor<PaymentAllocation> allocCaptor = ArgumentCaptor.forClass(PaymentAllocation.class);
        verify(paymentAllocationRepository, times(2)).save(allocCaptor.capture());
        List<PaymentAllocation> allocations = allocCaptor.getAllValues();

        // Charge 1 gets 300 (full)
        assertThat(allocations.get(0).getRentalCharge().getId()).isEqualTo(charge1.getId());
        assertThat(allocations.get(0).getAllocatedAmount()).isEqualByComparingTo(BigDecimal.valueOf(300.00));
        assertThat(charge1.getStatus()).isEqualTo(ChargeStatus.PAID);

        // Charge 2 gets remaining 150 (partial)
        assertThat(allocations.get(1).getRentalCharge().getId()).isEqualTo(charge2.getId());
        assertThat(allocations.get(1).getAllocatedAmount()).isEqualByComparingTo(BigDecimal.valueOf(150.00));
        assertThat(charge2.getStatus()).isEqualTo(ChargeStatus.PARTIALLY_PAID);
    }

    @Test
    @DisplayName("Manual allocation: Should reject currency mismatch between payment and charge")
    void recordPayment_manualAllocationCurrencyMismatch_throwsBusinessException() {
        RentalCharge ronCharge = new RentalCharge(sampleRental, 1,
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 1),
                BigDecimal.valueOf(100.00), "RON", "RON charge");
        ronCharge.setId(UUID.randomUUID());

        RecordPaymentRequest request = new RecordPaymentRequest(
                sampleCustomer.getId(),
                null,
                LocalDate.of(2026, 10, 10),
                BigDecimal.valueOf(100.00),
                "EUR", // Paying in EUR
                PaymentMethod.BANK_TRANSFER,
                "TRF-EUR-1",
                "EUR payment",
                "MANUAL",
                List.of(new ManualAllocationItem(ronCharge.getId(), BigDecimal.valueOf(100.00)))
        );

        when(customerRepository.findById(sampleCustomer.getId())).thenReturn(Optional.of(sampleCustomer));
        when(appUserRepository.findById(sampleUser.getId())).thenReturn(Optional.of(sampleUser));
        when(paymentRepository.save(any(Payment.class))).thenAnswer(i -> {
            Payment p = i.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });
        when(rentalChargeRepository.findById(ronCharge.getId())).thenReturn(Optional.of(ronCharge));

        assertThatThrownBy(() -> paymentService.recordPayment(request, sampleUser.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Currency mismatch: payment currency EUR does not match charge currency RON");
    }

    @Test
    @DisplayName("Reversal: Should mark payment as REVERSED, recalculate charge status back to UNPAID, and write audit trail")
    void reversePayment_success() {
        UUID paymentId = UUID.randomUUID();
        Payment payment = new Payment(sampleCustomer, sampleRental, LocalDate.of(2026, 10, 10),
                BigDecimal.valueOf(300.00), "RON", PaymentMethod.CASH, "REC-01", "Notes", sampleUser);
        payment.setId(paymentId);

        RentalCharge charge = new RentalCharge(sampleRental, 1,
                LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 7), LocalDate.of(2026, 10, 1),
                BigDecimal.valueOf(300.00), "RON", "Charge 1");
        charge.setId(UUID.randomUUID());
        charge.setStatus(ChargeStatus.PAID);

        PaymentAllocation allocation = new PaymentAllocation(payment, charge, BigDecimal.valueOf(300.00), "RON");
        payment.getAllocations().add(allocation);

        when(paymentRepository.findById(paymentId)).thenReturn(Optional.of(payment));
        when(appUserRepository.findById(sampleUser.getId())).thenReturn(Optional.of(sampleUser));
        when(paymentAllocationRepository.sumAllocatedForCharge(charge.getId())).thenReturn(BigDecimal.ZERO);
        when(paymentReversalRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        ReversePaymentRequest reverseRequest = new ReversePaymentRequest("Customer bounced check");
        PaymentDto reversedDto = paymentService.reversePayment(paymentId, reverseRequest, sampleUser.getId());

        assertThat(reversedDto.getStatus()).isEqualTo(PaymentStatus.REVERSED);
        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.REVERSED);
        assertThat(charge.getStatus()).isEqualTo(ChargeStatus.UNPAID);
        verify(rentalChargeRepository).save(charge);
        verify(paymentReversalRepository).save(any());
    }

    @Test
    @DisplayName("Balance summary: Strictly isolates totals for RON, EUR, and USD")
    void getCustomerBalanceSummary_multiCurrencySeparation() {
        when(customerRepository.findById(sampleCustomer.getId())).thenReturn(Optional.of(sampleCustomer));

        when(rentalChargeRepository.sumChargesByCustomerGroupedByCurrency(sampleCustomer.getId()))
                .thenReturn(List.of(
                        new Object[]{"RON", BigDecimal.valueOf(1400.00)},
                        new Object[]{"EUR", BigDecimal.valueOf(200.00)}
                ));

        when(paymentRepository.sumConfirmedPaymentsByCustomerGroupedByCurrency(sampleCustomer.getId()))
                .thenReturn(List.of(
                        new Object[]{"RON", BigDecimal.valueOf(700.00)},
                        new Object[]{"USD", BigDecimal.valueOf(50.00)}
                ));

        CustomerBalanceSummaryDto summary = paymentService.getCustomerBalanceSummary(sampleCustomer.getId());

        assertThat(summary.getCustomerId()).isEqualTo(sampleCustomer.getId());

        CustomerBalanceSummaryDto.CurrencyBalanceDto ron = summary.getBalances().get("RON");
        assertThat(ron.getTotalBilled()).isEqualByComparingTo(BigDecimal.valueOf(1400.00));
        assertThat(ron.getTotalPaid()).isEqualByComparingTo(BigDecimal.valueOf(700.00));
        assertThat(ron.getTotalOutstanding()).isEqualByComparingTo(BigDecimal.valueOf(700.00));

        CustomerBalanceSummaryDto.CurrencyBalanceDto eur = summary.getBalances().get("EUR");
        assertThat(eur.getTotalBilled()).isEqualByComparingTo(BigDecimal.valueOf(200.00));
        assertThat(eur.getTotalPaid()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(eur.getTotalOutstanding()).isEqualByComparingTo(BigDecimal.valueOf(200.00));

        CustomerBalanceSummaryDto.CurrencyBalanceDto usd = summary.getBalances().get("USD");
        assertThat(usd.getTotalBilled()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(usd.getTotalPaid()).isEqualByComparingTo(BigDecimal.valueOf(50.00));
        assertThat(usd.getTotalOutstanding()).isEqualByComparingTo(BigDecimal.ZERO);
    }
}

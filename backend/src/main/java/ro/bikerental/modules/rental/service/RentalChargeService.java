package ro.bikerental.modules.rental.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.payment.repository.PaymentAllocationRepository;
import ro.bikerental.modules.rental.dto.RentalChargeDto;
import ro.bikerental.modules.rental.entity.ChargeStatus;
import ro.bikerental.modules.rental.entity.Rental;
import ro.bikerental.modules.rental.entity.RentalCharge;
import ro.bikerental.modules.rental.entity.RentalStatus;
import ro.bikerental.modules.rental.repository.RentalChargeRepository;
import ro.bikerental.modules.rental.repository.RentalRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class RentalChargeService {

    private final RentalChargeRepository rentalChargeRepository;
    private final RentalRepository rentalRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;

    public RentalChargeService(RentalChargeRepository rentalChargeRepository,
                               RentalRepository rentalRepository,
                               PaymentAllocationRepository paymentAllocationRepository) {
        this.rentalChargeRepository = rentalChargeRepository;
        this.rentalRepository = rentalRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
    }

    @Transactional
    public RentalChargeDto generateNextWeeklyCharge(UUID rentalId) {
        Rental rental = rentalRepository.findById(rentalId)
                .orElseThrow(() -> new ResourceNotFoundException("Rental agreement", rentalId));

        return generateCharges(rental, null).getFirst();
    }

    @Transactional
    public List<RentalChargeDto> generateChargesUpToDate(UUID rentalId, LocalDate targetDate) {
        Rental rental = rentalRepository.findById(rentalId)
                .orElseThrow(() -> new ResourceNotFoundException("Rental agreement", rentalId));
        return generateCharges(rental, targetDate);
    }

    private List<RentalChargeDto> generateCharges(Rental rental, LocalDate targetDate) {
        if (rental.getStatus() == RentalStatus.CANCELLED) {
            throw new BusinessException("Cannot generate charges for a cancelled rental");
        }

        RentalCharge latest = rentalChargeRepository.findFirstByRentalIdOrderByChargeSequenceDesc(rental.getId())
                .orElse(null);
        int sequence = latest == null ? 1 : latest.getChargeSequence() + 1;
        LocalDate nextStart = rental.getStartDate();
        if (latest != null) {
            LocalDate lastDay = latest.getDueDate().isAfter(latest.getPeriodEndDate())
                    ? latest.getDueDate() : latest.getPeriodEndDate();
            nextStart = lastDay.plusDays(1);
        }

        LocalDate closedDate = rental.getActualClosedDate();
        if (targetDate == null && closedDate != null && nextStart.isAfter(closedDate)) {
            throw new BusinessException("Cannot generate charge after rental actual closed date: " + closedDate);
        }
        LocalDate lastDay = targetDate == null ? nextStart.plusDays(6) : targetDate;
        if (closedDate != null && closedDate.isBefore(lastDay)) {
            lastDay = closedDate;
        }

        List<RentalChargeDto> generated = new ArrayList<>();
        while (!nextStart.isAfter(lastDay)) {
            LocalDate weeklyEnd = nextStart.plusDays(6);
            LocalDate end = weeklyEnd.isAfter(lastDay) ? lastDay : weeklyEnd;
            long days = ChronoUnit.DAYS.between(nextStart, end) + 1;
            BigDecimal amount = rental.getWeeklyRate().multiply(BigDecimal.valueOf(days))
                    .divide(BigDecimal.valueOf(7), 2, RoundingMode.HALF_UP);
            RentalCharge charge = new RentalCharge(rental, sequence, nextStart, end, nextStart,
                    amount, rental.getCurrency(), "Recurring weekly charge #" + sequence);
            generated.add(RentalChargeDto.fromEntity(rentalChargeRepository.save(charge), BigDecimal.ZERO));
            sequence++;
            nextStart = end.plusDays(1);
        }
        return generated;
    }

    @Transactional(readOnly = true)
    public List<RentalChargeDto> getChargesForRental(UUID rentalId) {
        List<RentalCharge> charges = rentalChargeRepository.findAllByRentalIdOrderByChargeSequenceAsc(rentalId);
        return enrichChargesWithPaidAmount(charges);
    }

    @Transactional(readOnly = true)
    public List<RentalChargeDto> getOverdueOrDueCharges(LocalDate asOfDate) {
        LocalDate date = asOfDate != null ? asOfDate : LocalDate.now();
        List<RentalCharge> charges = rentalChargeRepository.findOverdueOrDueByDate(
                date,
                List.of(ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID)
        );
        return enrichChargesWithPaidAmount(charges);
    }

    @Transactional(readOnly = true)
    public PageResponse<RentalChargeDto> searchCharges(ChargeStatus status, String currency, UUID customerId,
                                                      UUID rentalId, Pageable pageable) {
        Page<RentalCharge> page = rentalChargeRepository.searchCharges(status, currency, customerId, rentalId, pageable);
        List<RentalChargeDto> dtos = enrichChargesWithPaidAmount(page.getContent());
        return new PageResponse<>(dtos, page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isLast());
    }

    private List<RentalChargeDto> enrichChargesWithPaidAmount(List<RentalCharge> charges) {
        if (charges.isEmpty()) return Collections.emptyList();

        List<UUID> chargeIds = charges.stream().map(RentalCharge::getId).collect(Collectors.toList());
        List<Object[]> sums = paymentAllocationRepository.sumAllocatedForCharges(chargeIds);
        Map<UUID, BigDecimal> paidMap = new HashMap<>();
        for (Object[] row : sums) {
            paidMap.put((UUID) row[0], (BigDecimal) row[1]);
        }

        return charges.stream()
                .map(c -> RentalChargeDto.fromEntity(c, paidMap.getOrDefault(c.getId(), BigDecimal.ZERO)))
                .collect(Collectors.toList());
    }
}

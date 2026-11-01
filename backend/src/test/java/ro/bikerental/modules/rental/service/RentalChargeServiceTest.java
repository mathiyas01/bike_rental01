package ro.bikerental.modules.rental.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.customer.entity.Customer;
import ro.bikerental.modules.payment.repository.PaymentAllocationRepository;
import ro.bikerental.modules.rental.dto.RentalChargeDto;
import ro.bikerental.modules.rental.entity.Rental;
import ro.bikerental.modules.rental.entity.RentalCharge;
import ro.bikerental.modules.rental.entity.RentalStatus;
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
class RentalChargeServiceTest {

    @Mock
    private RentalChargeRepository rentalChargeRepository;

    @Mock
    private RentalRepository rentalRepository;

    @Mock
    private PaymentAllocationRepository paymentAllocationRepository;

    private RentalChargeService rentalChargeService;

    private Rental sampleRental;

    @BeforeEach
    void setUp() {
        rentalChargeService = new RentalChargeService(rentalChargeRepository, rentalRepository, paymentAllocationRepository);

        Customer customer = new Customer("Andrei Vasilescu", "+40721234567", "andrei@email.ro", "1940512123456", "B00123456Z", "A,B", LocalDate.of(2030, 1, 1), "Bucuresti", LocalDate.now(), null);
        Bike bike = new Bike("B 123 BIK", "JH2PC37053M000001", "Honda", "PCX 125", 2024, BigDecimal.valueOf(1000), LocalDate.now().plusYears(1), LocalDate.now().plusMonths(6), null, ro.bikerental.modules.bike.entity.BikeStatus.AVAILABLE, null);
        sampleRental = new Rental(customer, bike, LocalDate.of(2026, 10, 1), null, BigDecimal.valueOf(350.00), "RON", null, null, null, null);
        sampleRental.setId(UUID.randomUUID());
    }

    @Test
    @DisplayName("Should advance sequence and 7-day period based on latest existing charge")
    void generateNextWeeklyCharge_fromLatest_success() {
        RentalCharge charge1 = new RentalCharge(sampleRental, 1,
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 7),
                LocalDate.of(2026, 10, 1),
                BigDecimal.valueOf(350.00), "RON", "Initial charge");
        charge1.setId(UUID.randomUUID());

        when(rentalRepository.findById(sampleRental.getId())).thenReturn(Optional.of(sampleRental));
        when(rentalChargeRepository.findFirstByRentalIdOrderByChargeSequenceDesc(sampleRental.getId()))
                .thenReturn(Optional.of(charge1));
        when(rentalChargeRepository.save(any(RentalCharge.class))).thenAnswer(i -> {
            RentalCharge c = i.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        RentalChargeDto next = rentalChargeService.generateNextWeeklyCharge(sampleRental.getId());

        assertThat(next).isNotNull();
        assertThat(next.getChargeSequence()).isEqualTo(2);
        assertThat(next.getPeriodStartDate()).isEqualTo(LocalDate.of(2026, 10, 8));
        assertThat(next.getPeriodEndDate()).isEqualTo(LocalDate.of(2026, 10, 14));
        assertThat(next.getDueDate()).isEqualTo(LocalDate.of(2026, 10, 8));
        assertThat(next.getAmount()).isEqualByComparingTo(BigDecimal.valueOf(350.00));
    }

    @Test
    @DisplayName("Should throw BusinessException when generating charges past rental closure date")
    void generateNextWeeklyCharge_pastClosedDate_throwsBusinessException() {
        sampleRental.setActualClosedDate(LocalDate.of(2026, 10, 7));
        sampleRental.setStatus(RentalStatus.CLOSED);

        RentalCharge charge1 = new RentalCharge(sampleRental, 1,
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 7),
                LocalDate.of(2026, 10, 1),
                BigDecimal.valueOf(350.00), "RON", "Initial charge");

        when(rentalRepository.findById(sampleRental.getId())).thenReturn(Optional.of(sampleRental));
        when(rentalChargeRepository.findFirstByRentalIdOrderByChargeSequenceDesc(sampleRental.getId()))
                .thenReturn(Optional.of(charge1));

        assertThatThrownBy(() -> rentalChargeService.generateNextWeeklyCharge(sampleRental.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Cannot generate charge after rental actual closed date");
    }

    @Test
    @DisplayName("Should enrich charges with paid amounts correctly")
    void getChargesForRental_enrichesWithPaidAmounts() {
        UUID chargeId = UUID.randomUUID();
        RentalCharge charge = new RentalCharge(sampleRental, 1,
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 7),
                LocalDate.of(2026, 10, 1),
                BigDecimal.valueOf(350.00), "RON", "Charge 1");
        charge.setId(chargeId);

        when(rentalChargeRepository.findAllByRentalIdOrderByChargeSequenceAsc(sampleRental.getId()))
                .thenReturn(List.of(charge));
        List<Object[]> mockSums = new java.util.ArrayList<>();
        mockSums.add(new Object[]{chargeId, BigDecimal.valueOf(150.00)});
        when(paymentAllocationRepository.sumAllocatedForCharges(List.of(chargeId)))
                .thenReturn(mockSums);

        List<RentalChargeDto> dtos = rentalChargeService.getChargesForRental(sampleRental.getId());

        assertThat(dtos).hasSize(1);
        RentalChargeDto dto = dtos.get(0);
        assertThat(dto.getAmount()).isEqualByComparingTo(BigDecimal.valueOf(350.00));
        assertThat(dto.getPaidAmount()).isEqualByComparingTo(BigDecimal.valueOf(150.00));
        assertThat(dto.getRemainingAmount()).isEqualByComparingTo(BigDecimal.valueOf(200.00));
    }
}

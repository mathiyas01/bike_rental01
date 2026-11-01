package ro.bikerental.modules.rental.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.repository.BikeRepository;
import ro.bikerental.modules.customer.entity.Customer;
import ro.bikerental.modules.customer.repository.CustomerRepository;
import ro.bikerental.modules.rental.dto.CloseRentalRequest;
import ro.bikerental.modules.rental.dto.CreateRentalRequest;
import ro.bikerental.modules.rental.dto.RentalDto;
import ro.bikerental.modules.rental.entity.Rental;
import ro.bikerental.modules.rental.entity.RentalCharge;
import ro.bikerental.modules.rental.entity.RentalStatus;
import ro.bikerental.modules.rental.repository.RentalChargeRepository;
import ro.bikerental.modules.rental.repository.RentalRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RentalServiceTest {

    @Mock
    private RentalRepository rentalRepository;

    @Mock
    private RentalChargeRepository rentalChargeRepository;

    @Mock
    private CustomerRepository customerRepository;

    @Mock
    private BikeRepository bikeRepository;

    private RentalService rentalService;

    private Customer sampleCustomer;
    private Bike sampleBike;

    @BeforeEach
    void setUp() {
        rentalService = new RentalService(rentalRepository, rentalChargeRepository, customerRepository, bikeRepository);

        sampleCustomer = new Customer("Andrei Vasilescu", "+40721234567", "andrei@email.ro", "1940512123456", "B00123456Z", "A,B", LocalDate.of(2030, 1, 1), "Bucuresti", LocalDate.now(), null);
        sampleCustomer.setId(UUID.randomUUID());

        sampleBike = new Bike("B 123 BIK", "JH2PC37053M000001", "Honda", "PCX 125", 2024, BigDecimal.valueOf(1000), LocalDate.now().plusYears(1), LocalDate.now().plusMonths(6), null, BikeStatus.AVAILABLE, null);
        sampleBike.setId(UUID.randomUUID());
    }

    @Test
    @DisplayName("Should successfully create a rental agreement, set bike to RENTED, and generate initial weekly charge")
    void createRental_success() {
        CreateRentalRequest request = new CreateRentalRequest(
                sampleCustomer.getId(),
                sampleBike.getId(),
                LocalDate.of(2026, 10, 22),
                null,
                BigDecimal.valueOf(350.00),
                "RON",
                BigDecimal.valueOf(500.00),
                "RON",
                "START_DAY",
                "Includes helmet"
        );

        when(customerRepository.findById(sampleCustomer.getId())).thenReturn(Optional.of(sampleCustomer));
        when(bikeRepository.findById(sampleBike.getId())).thenReturn(Optional.of(sampleBike));
        when(rentalRepository.existsByBikeIdAndStatus(sampleBike.getId(), RentalStatus.ACTIVE)).thenReturn(false);
        when(rentalRepository.save(any(Rental.class))).thenAnswer(i -> {
            Rental r = i.getArgument(0);
            r.setId(UUID.randomUUID());
            return r;
        });

        RentalDto result = rentalService.createRental(request);

        assertThat(result).isNotNull();
        assertThat(result.getStatus()).isEqualTo(RentalStatus.ACTIVE);
        assertThat(result.getWeeklyRate()).isEqualByComparingTo(BigDecimal.valueOf(350.00));
        assertThat(result.getCurrency()).isEqualTo("RON");
        assertThat(sampleBike.getStatus()).isEqualTo(BikeStatus.RENTED);

        ArgumentCaptor<RentalCharge> chargeCaptor = ArgumentCaptor.forClass(RentalCharge.class);
        verify(rentalChargeRepository).save(chargeCaptor.capture());
        RentalCharge generatedCharge = chargeCaptor.getValue();
        assertThat(generatedCharge.getChargeSequence()).isEqualTo(1);
        assertThat(generatedCharge.getPeriodStartDate()).isEqualTo(LocalDate.of(2026, 10, 22));
        assertThat(generatedCharge.getPeriodEndDate()).isEqualTo(LocalDate.of(2026, 10, 28));
        assertThat(generatedCharge.getDueDate()).isEqualTo(LocalDate.of(2026, 10, 22));
        assertThat(generatedCharge.getAmount()).isEqualByComparingTo(BigDecimal.valueOf(350.00));
    }

    @Test
    @DisplayName("Should throw ConflictException when motorbike is already RENTED")
    void createRental_bikeAlreadyRented_throwsConflict() {
        sampleBike.setStatus(BikeStatus.RENTED);

        CreateRentalRequest request = new CreateRentalRequest(
                sampleCustomer.getId(),
                sampleBike.getId(),
                LocalDate.of(2026, 10, 22),
                null,
                BigDecimal.valueOf(350.00),
                "RON",
                BigDecimal.valueOf(500.00),
                "RON",
                "START_DAY",
                null
        );

        when(customerRepository.findById(sampleCustomer.getId())).thenReturn(Optional.of(sampleCustomer));
        when(bikeRepository.findById(sampleBike.getId())).thenReturn(Optional.of(sampleBike));

        assertThatThrownBy(() -> rentalService.createRental(request))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("is not available");

        verify(rentalRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should throw BusinessException when customer is archived")
    void createRental_customerArchived_throwsBusinessException() {
        sampleCustomer.setArchived(true);

        CreateRentalRequest request = new CreateRentalRequest(
                sampleCustomer.getId(),
                sampleBike.getId(),
                LocalDate.of(2026, 10, 22),
                null,
                BigDecimal.valueOf(350.00),
                "RON",
                null,
                null,
                null,
                null
        );

        when(customerRepository.findById(sampleCustomer.getId())).thenReturn(Optional.of(sampleCustomer));

        assertThatThrownBy(() -> rentalService.createRental(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Cannot create a rental for an archived customer");
    }

    @Test
    @DisplayName("Should successfully close a rental agreement and restore bike status to AVAILABLE")
    void closeRental_success() {
        UUID rentalId = UUID.randomUUID();
        Rental rental = new Rental(sampleCustomer, sampleBike, LocalDate.of(2026, 10, 1), null,
                BigDecimal.valueOf(300), "RON", null, null, null, null);
        rental.setId(rentalId);
        sampleBike.setStatus(BikeStatus.RENTED);

        when(rentalRepository.findById(rentalId)).thenReturn(Optional.of(rental));
        when(rentalRepository.save(any(Rental.class))).thenAnswer(i -> i.getArgument(0));

        CloseRentalRequest closeRequest = new CloseRentalRequest(
                LocalDate.of(2026, 10, 20),
                "Returned in good shape"
        );

        RentalDto closed = rentalService.closeRental(rentalId, closeRequest);

        assertThat(closed.getStatus()).isEqualTo(RentalStatus.CLOSED);
        assertThat(closed.getActualClosedDate()).isEqualTo(LocalDate.of(2026, 10, 20));
        assertThat(sampleBike.getStatus()).isEqualTo(BikeStatus.AVAILABLE);
        verify(bikeRepository).save(sampleBike);
    }

    @Test
    @DisplayName("Should throw BusinessException if closure date is earlier than start date")
    void closeRental_invalidClosureDate_throwsBusinessException() {
        UUID rentalId = UUID.randomUUID();
        Rental rental = new Rental(sampleCustomer, sampleBike, LocalDate.of(2026, 10, 15), null,
                BigDecimal.valueOf(300), "RON", null, null, null, null);
        rental.setId(rentalId);

        when(rentalRepository.findById(rentalId)).thenReturn(Optional.of(rental));

        CloseRentalRequest closeRequest = new CloseRentalRequest(
                LocalDate.of(2026, 10, 10),
                null
        );

        assertThatThrownBy(() -> rentalService.closeRental(rentalId, closeRequest))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Closure date cannot be earlier than rental start date");
    }
}

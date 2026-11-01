package ro.bikerental.modules.bike.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.modules.bike.dto.BikeDto;
import ro.bikerental.modules.bike.dto.CreateBikeRequest;
import ro.bikerental.modules.bike.dto.UpdateBikeRequest;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.repository.BikeRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BikeServiceTest {

    @Mock
    private BikeRepository bikeRepository;

    private BikeService bikeService;

    @BeforeEach
    void setUp() {
        bikeService = new BikeService(bikeRepository);
    }

    @Test
    @DisplayName("Should successfully create a motorbike with uppercase registration and VIN")
    void createBike_success() {
        CreateBikeRequest request = new CreateBikeRequest(
                "b 123 bik",
                "jh2pc37053m000001",
                "Honda",
                "PCX 125",
                2024,
                BigDecimal.valueOf(1500.5),
                LocalDate.of(2027, 5, 15),
                LocalDate.of(2027, 4, 10),
                null,
                BikeStatus.AVAILABLE,
                "Clean delivery scooter"
        );

        when(bikeRepository.existsByRegistrationNumber("B 123 BIK")).thenReturn(false);
        when(bikeRepository.existsByVin("JH2PC37053M000001")).thenReturn(false);
        when(bikeRepository.save(any(Bike.class))).thenAnswer(i -> {
            Bike b = i.getArgument(0);
            b.setId(UUID.randomUUID());
            return b;
        });

        BikeDto created = bikeService.createBike(request);

        assertThat(created).isNotNull();
        assertThat(created.getRegistrationNumber()).isEqualTo("B 123 BIK");
        assertThat(created.getVin()).isEqualTo("JH2PC37053M000001");
        assertThat(created.getStatus()).isEqualTo(BikeStatus.AVAILABLE);
        verify(bikeRepository).save(any(Bike.class));
    }

    @Test
    @DisplayName("Should reject motorbike creation with duplicate registration plate")
    void createBike_duplicatePlate_throwsConflict() {
        CreateBikeRequest request = new CreateBikeRequest(
                "B 123 BIK", "JH2PC37053M000001", "Honda", "PCX 125",
                2024, BigDecimal.ZERO, null, null, null, BikeStatus.AVAILABLE, null
        );

        when(bikeRepository.existsByRegistrationNumber("B 123 BIK")).thenReturn(true);

        assertThatThrownBy(() -> bikeService.createBike(request))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("B 123 BIK");

        verify(bikeRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should reject motorbike creation with duplicate VIN")
    void createBike_duplicateVin_throwsConflict() {
        CreateBikeRequest request = new CreateBikeRequest(
                "B 999 BIK", "JH2PC37053M000001", "Honda", "PCX 125",
                2024, BigDecimal.ZERO, null, null, null, BikeStatus.AVAILABLE, null
        );

        when(bikeRepository.existsByRegistrationNumber("B 999 BIK")).thenReturn(false);
        when(bikeRepository.existsByVin("JH2PC37053M000001")).thenReturn(true);

        assertThatThrownBy(() -> bikeService.createBike(request))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("JH2PC37053M000001");

        verify(bikeRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should update bike operational status to IN_SERVICE")
    void updateBikeStatus_success() {
        UUID bikeId = UUID.randomUUID();
        Bike bike = new Bike("B 123 BIK", "VIN12345", "Honda", "PCX", 2024, BigDecimal.ZERO, null, null, null, BikeStatus.AVAILABLE, null);
        bike.setId(bikeId);

        when(bikeRepository.findById(bikeId)).thenReturn(Optional.of(bike));
        when(bikeRepository.save(any(Bike.class))).thenAnswer(i -> i.getArgument(0));

        BikeDto updated = bikeService.updateBikeStatus(bikeId, BikeStatus.IN_SERVICE);

        assertThat(updated.getStatus()).isEqualTo(BikeStatus.IN_SERVICE);
    }

    @Test
    @DisplayName("Should reject directly changing status of rented bike to AVAILABLE without rental closure")
    void updateBikeStatus_rentedBikeDirectChange_throwsBusinessException() {
        UUID bikeId = UUID.randomUUID();
        Bike bike = new Bike("B 123 BIK", "VIN12345", "Honda", "PCX", 2024, BigDecimal.ZERO, null, null, null, BikeStatus.RENTED, null);
        bike.setId(bikeId);

        when(bikeRepository.findById(bikeId)).thenReturn(Optional.of(bike));

        assertThatThrownBy(() -> bikeService.updateBikeStatus(bikeId, BikeStatus.AVAILABLE))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("currently rented bike");

        verify(bikeRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should archive bike and transition status to INACTIVE")
    void archiveBike_success() {
        UUID bikeId = UUID.randomUUID();
        Bike bike = new Bike("B 123 BIK", "VIN12345", "Honda", "PCX", 2024, BigDecimal.ZERO, null, null, null, BikeStatus.AVAILABLE, null);
        bike.setId(bikeId);

        when(bikeRepository.findById(bikeId)).thenReturn(Optional.of(bike));
        when(bikeRepository.save(any(Bike.class))).thenAnswer(i -> i.getArgument(0));

        BikeDto archived = bikeService.archiveBike(bikeId);

        assertThat(archived.isArchived()).isTrue();
        assertThat(archived.getStatus()).isEqualTo(BikeStatus.INACTIVE);
    }
}

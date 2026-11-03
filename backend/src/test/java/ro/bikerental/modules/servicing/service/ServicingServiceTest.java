package ro.bikerental.modules.servicing.service;

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
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.repository.BikeRepository;
import ro.bikerental.modules.inventory.entity.Part;
import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;
import ro.bikerental.modules.inventory.repository.PartRepository;
import ro.bikerental.modules.inventory.repository.StockMovementRepository;
import ro.bikerental.modules.servicing.dto.LogServicePartItem;
import ro.bikerental.modules.servicing.dto.LogServiceRequest;
import ro.bikerental.modules.servicing.dto.ServiceRecordDto;
import ro.bikerental.modules.servicing.entity.ServicePartUsage;
import ro.bikerental.modules.servicing.entity.ServiceRecord;
import ro.bikerental.modules.servicing.entity.ServiceStatus;
import ro.bikerental.modules.servicing.repository.ServicePartUsageRepository;
import ro.bikerental.modules.servicing.repository.ServiceRecordRepository;

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
class ServicingServiceTest {

    @Mock
    private ServiceRecordRepository serviceRecordRepository;

    @Mock
    private ServicePartUsageRepository servicePartUsageRepository;

    @Mock
    private BikeRepository bikeRepository;

    @Mock
    private PartRepository partRepository;

    @Mock
    private StockMovementRepository stockMovementRepository;

    @Mock
    private AppUserRepository appUserRepository;

    private ServicingService servicingService;

    private Bike sampleBike;
    private Part sampleOilPart;
    private AppUser sampleUser;

    @BeforeEach
    void setUp() {
        servicingService = new ServicingService(
                serviceRecordRepository,
                servicePartUsageRepository,
                bikeRepository,
                partRepository,
                stockMovementRepository,
                appUserRepository
        );

        sampleBike = new Bike("B 123 BIK", "JH2PC37053M000001", "Honda", "PCX 125", 2024,
                BigDecimal.valueOf(14000.0), LocalDate.now().plusYears(1), LocalDate.now().plusMonths(6),
                null, BikeStatus.AVAILABLE, null);
        sampleBike.setId(UUID.randomUUID());

        sampleOilPart = new Part("OIL-4T", "Engine Oil 1L", "LUBRICANTS", null, "LITRE",
                BigDecimal.valueOf(10.0), BigDecimal.valueOf(2.0), BigDecimal.valueOf(50.00), "RON", null);
        sampleOilPart.setId(UUID.randomUUID());

        sampleUser = new AppUser("mechanic@bikerental.ro", "secret", "Master Mechanic", "ROLE_OWNER", "en");
        sampleUser.setId(UUID.randomUUID());
    }

    @Test
    @DisplayName("Should successfully log service, deduct parts stock, log stock movement, and advance bike odometer")
    void logService_success() {
        LogServiceRequest request = new LogServiceRequest(
                sampleBike.getId(),
                LocalDate.of(2026, 10, 22),
                BigDecimal.valueOf(15000.0), // increased from 14000.0
                "Official Honda Service",
                "15,000 km periodic inspection and oil replacement",
                BigDecimal.valueOf(120.00),
                "RON",
                ServiceStatus.COMPLETED,
                LocalDate.of(2027, 4, 22),
                BigDecimal.valueOf(20000.0),
                "No mechanical issues found",
                List.of(new LogServicePartItem(sampleOilPart.getId(), BigDecimal.valueOf(2.0), BigDecimal.valueOf(50.00), "RON"))
        );

        when(bikeRepository.findById(sampleBike.getId())).thenReturn(Optional.of(sampleBike));
        when(appUserRepository.findById(sampleUser.getId())).thenReturn(Optional.of(sampleUser));
        when(partRepository.findById(sampleOilPart.getId())).thenReturn(Optional.of(sampleOilPart));

        when(serviceRecordRepository.save(any(ServiceRecord.class))).thenAnswer(i -> {
            ServiceRecord r = i.getArgument(0);
            r.setId(UUID.randomUUID());
            return r;
        });
        when(servicePartUsageRepository.save(any(ServicePartUsage.class))).thenAnswer(i -> {
            ServicePartUsage u = i.getArgument(0);
            u.setId(UUID.randomUUID());
            return u;
        });

        ServiceRecordDto result = servicingService.logService(request, sampleUser.getId());

        assertThat(result).isNotNull();
        assertThat(result.getLabourCost()).isEqualByComparingTo(BigDecimal.valueOf(120.00));
        assertThat(result.getPartsCost()).isEqualByComparingTo(BigDecimal.valueOf(100.00)); // 2 x 50
        assertThat(result.getTotalCost()).isEqualByComparingTo(BigDecimal.valueOf(220.00));

        // Verify bike odometer updated
        assertThat(sampleBike.getCurrentOdometer()).isEqualByComparingTo(BigDecimal.valueOf(15000.0));
        verify(bikeRepository).save(sampleBike);

        // Verify part stock reduced from 10.0 to 8.0
        assertThat(sampleOilPart.getCurrentQuantity()).isEqualByComparingTo(BigDecimal.valueOf(8.0));
        verify(partRepository).save(sampleOilPart);

        // Verify StockMovement recorded
        ArgumentCaptor<StockMovement> movementCaptor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepository).save(movementCaptor.capture());
        StockMovement movement = movementCaptor.getValue();
        assertThat(movement.getMovementType()).isEqualTo(StockMovementType.SERVICE_USAGE);
        assertThat(movement.getQuantityDelta()).isEqualByComparingTo(BigDecimal.valueOf(-2.0));
    }

    @Test
    @DisplayName("Should reject service logging when part quantity is insufficient")
    void logService_insufficientPartStock_throwsBusinessException() {
        LogServiceRequest request = new LogServiceRequest(
                sampleBike.getId(),
                LocalDate.of(2026, 10, 22),
                BigDecimal.valueOf(15000.0),
                "Official Honda Service",
                "Full overhaul",
                BigDecimal.valueOf(120.00),
                "RON",
                ServiceStatus.COMPLETED,
                null,
                null,
                null,
                List.of(new LogServicePartItem(sampleOilPart.getId(), BigDecimal.valueOf(20.0), BigDecimal.valueOf(50.00), "RON")) // available is only 10.0
        );

        when(bikeRepository.findById(sampleBike.getId())).thenReturn(Optional.of(sampleBike));
        when(appUserRepository.findById(sampleUser.getId())).thenReturn(Optional.of(sampleUser));
        when(partRepository.findById(sampleOilPart.getId())).thenReturn(Optional.of(sampleOilPart));

        assertThatThrownBy(() -> servicingService.logService(request, sampleUser.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Insufficient stock for part");

        verify(serviceRecordRepository, never()).save(any());
        verify(stockMovementRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should reject service logging if odometer is lower than current bike odometer")
    void logService_lowerOdometer_throwsBusinessException() {
        LogServiceRequest request = new LogServiceRequest(
                sampleBike.getId(),
                LocalDate.of(2026, 10, 22),
                BigDecimal.valueOf(12000.0), // bike currently has 14000.0
                "Service",
                "Inspection",
                BigDecimal.ZERO,
                "RON",
                ServiceStatus.COMPLETED,
                null,
                null,
                null,
                null
        );

        when(bikeRepository.findById(sampleBike.getId())).thenReturn(Optional.of(sampleBike));

        assertThatThrownBy(() -> servicingService.logService(request, sampleUser.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("cannot be less than current motorbike odometer");
    }

    @Test
    @DisplayName("Should calculate and persist the next service date from the bike interval")
    void logService_calculatesNextServiceDate() {
        sampleBike.setServiceIntervalDays(45);
        LogServiceRequest request = new LogServiceRequest(
                sampleBike.getId(),
                LocalDate.of(2026, 10, 22),
                BigDecimal.valueOf(14000.0),
                "Service",
                "Periodic service",
                BigDecimal.ZERO,
                "RON",
                ServiceStatus.COMPLETED,
                null,
                null,
                null,
                List.of()
        );

        when(bikeRepository.findById(sampleBike.getId())).thenReturn(Optional.of(sampleBike));
        when(appUserRepository.findById(sampleUser.getId())).thenReturn(Optional.of(sampleUser));
        when(serviceRecordRepository.save(any(ServiceRecord.class))).thenAnswer(i -> {
            ServiceRecord record = i.getArgument(0);
            record.setId(UUID.randomUUID());
            return record;
        });

        ServiceRecordDto result = servicingService.logService(request, sampleUser.getId());

        LocalDate expectedDueDate = LocalDate.of(2026, 12, 6);
        assertThat(result.getNextServiceDueDate()).isEqualTo(expectedDueDate);
        assertThat(sampleBike.getNextServiceDueDate()).isEqualTo(expectedDueDate);
        verify(bikeRepository).save(sampleBike);
    }
}

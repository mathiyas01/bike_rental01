package ro.bikerental.modules.inventory.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;
import ro.bikerental.modules.inventory.dto.CreatePartRequest;
import ro.bikerental.modules.inventory.dto.PartDto;
import ro.bikerental.modules.inventory.entity.Part;
import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;
import ro.bikerental.modules.inventory.repository.PartRepository;
import ro.bikerental.modules.inventory.repository.StockMovementRepository;
import ro.bikerental.modules.inventory.repository.SupplierRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PartServiceTest {

    @Mock
    private PartRepository partRepository;

    @Mock
    private SupplierRepository supplierRepository;

    @Mock
    private StockMovementRepository stockMovementRepository;

    @Mock
    private AppUserRepository appUserRepository;

    private PartService partService;

    @BeforeEach
    void setUp() {
        partService = new PartService(partRepository, supplierRepository, stockMovementRepository, appUserRepository);
    }

    @Test
    @DisplayName("Should create spare part and write initial STOCK_IN movement when initial quantity > 0")
    void createPart_withInitialStock_createsPartAndMovement() {
        CreatePartRequest request = new CreatePartRequest(
                "OIL-10W40",
                "Motul 7100 10W40 4T",
                "LUBRICANTS",
                "Full synthetic engine oil 1L",
                "LITRE",
                BigDecimal.valueOf(10.0),
                BigDecimal.valueOf(3.0),
                BigDecimal.valueOf(45.00),
                "RON",
                null
        );

        UUID userId = UUID.randomUUID();
        AppUser user = new AppUser("admin@bikerental.ro", "secret", "Owner", "ROLE_OWNER", "en");
        user.setId(userId);
        when(appUserRepository.findById(userId)).thenReturn(Optional.of(user));

        when(partRepository.existsByPartCodeIgnoreCase("OIL-10W40")).thenReturn(false);
        when(partRepository.save(any(Part.class))).thenAnswer(i -> {
            Part p = i.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        PartDto result = partService.createPart(request, userId);

        assertThat(result).isNotNull();
        assertThat(result.getPartCode()).isEqualTo("OIL-10W40");
        assertThat(result.getCurrentQuantity()).isEqualByComparingTo(BigDecimal.valueOf(10.0));
        assertThat(result.isLowStock()).isFalse();

        ArgumentCaptor<StockMovement> movementCaptor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepository).save(movementCaptor.capture());
        StockMovement movement = movementCaptor.getValue();
        assertThat(movement.getMovementType()).isEqualTo(StockMovementType.STOCK_IN);
        assertThat(movement.getQuantityDelta()).isEqualByComparingTo(BigDecimal.valueOf(10.0));
    }

    @Test
    @DisplayName("Should throw ConflictException when creating part with duplicate code")
    void createPart_duplicateCode_throwsConflict() {
        CreatePartRequest request = new CreatePartRequest(
                "OIL-10W40",
                "Motul 7100 10W40",
                "LUBRICANTS",
                null,
                "LITRE",
                BigDecimal.ZERO,
                BigDecimal.valueOf(2.0),
                BigDecimal.valueOf(40.00),
                "RON",
                null
        );

        when(partRepository.existsByPartCodeIgnoreCase("OIL-10W40")).thenReturn(true);

        assertThatThrownBy(() -> partService.createPart(request, null))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already exists");
    }

    @Test
    @DisplayName("Should correctly identify low-stock parts when current quantity <= minReorderLevel")
    void getLowStockParts_returnsPartsAtOrBelowThreshold() {
        Part p1 = new Part("PAD-F", "Front Brake Pads", "BRAKES", null, "PCS",
                BigDecimal.valueOf(1.0), BigDecimal.valueOf(3.0), BigDecimal.valueOf(65.00), "RON", null);
        p1.setId(UUID.randomUUID());

        when(partRepository.findLowStockParts()).thenReturn(List.of(p1));

        List<PartDto> lowStock = partService.getLowStockParts();

        assertThat(lowStock).hasSize(1);
        assertThat(lowStock.get(0).getPartCode()).isEqualTo("PAD-F");
        assertThat(lowStock.get(0).isLowStock()).isTrue();
    }
}

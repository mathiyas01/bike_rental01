package ro.bikerental.modules.inventory.service;

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
import ro.bikerental.modules.inventory.dto.RecordStockMovementRequest;
import ro.bikerental.modules.inventory.dto.StockMovementDto;
import ro.bikerental.modules.inventory.entity.Part;
import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;
import ro.bikerental.modules.inventory.repository.PartRepository;
import ro.bikerental.modules.inventory.repository.StockMovementRepository;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StockMovementServiceTest {

    @Mock
    private StockMovementRepository stockMovementRepository;

    @Mock
    private PartRepository partRepository;

    @Mock
    private AppUserRepository appUserRepository;

    private StockMovementService stockMovementService;

    private Part samplePart;
    private AppUser sampleUser;

    @BeforeEach
    void setUp() {
        stockMovementService = new StockMovementService(stockMovementRepository, partRepository, appUserRepository);

        samplePart = new Part("FLT-AIR", "Air Filter Honda PCX", "FILTERS", null, "PCS",
                BigDecimal.valueOf(5.0), BigDecimal.valueOf(2.0), BigDecimal.valueOf(35.00), "RON", null);
        samplePart.setId(UUID.randomUUID());

        sampleUser = new AppUser("admin@bikerental.ro", "secret", "Business Owner", "ROLE_OWNER", "en");
        sampleUser.setId(UUID.randomUUID());
    }

    @Test
    @DisplayName("STOCK_IN: Should add quantity and record immutable stock movement")
    void recordStockMovement_stockIn_increasesQuantity() {
        RecordStockMovementRequest request = new RecordStockMovementRequest(
                samplePart.getId(),
                BigDecimal.valueOf(10.0),
                StockMovementType.STOCK_IN,
                "SUPPLIER_INVOICE",
                null,
                BigDecimal.valueOf(32.00),
                "RON",
                "Restock delivery"
        );

        when(partRepository.findById(samplePart.getId())).thenReturn(Optional.of(samplePart));
        when(appUserRepository.findById(sampleUser.getId())).thenReturn(Optional.of(sampleUser));
        when(stockMovementRepository.save(any(StockMovement.class))).thenAnswer(i -> {
            StockMovement sm = i.getArgument(0);
            sm.setId(UUID.randomUUID());
            return sm;
        });

        StockMovementDto result = stockMovementService.recordStockMovement(request, sampleUser.getId());

        assertThat(result).isNotNull();
        assertThat(samplePart.getCurrentQuantity()).isEqualByComparingTo(BigDecimal.valueOf(15.0));
        verify(partRepository).save(samplePart);

        ArgumentCaptor<StockMovement> captor = ArgumentCaptor.forClass(StockMovement.class);
        verify(stockMovementRepository).save(captor.capture());
        assertThat(captor.getValue().getQuantityDelta()).isEqualByComparingTo(BigDecimal.valueOf(10.0));
    }

    @Test
    @DisplayName("STOCK_OUT: Should throw BusinessException and prevent negative stock when balance is insufficient")
    void recordStockMovement_insufficientStock_throwsBusinessException() {
        RecordStockMovementRequest request = new RecordStockMovementRequest(
                samplePart.getId(),
                BigDecimal.valueOf(10.0), // available is only 5.0
                StockMovementType.STOCK_OUT,
                "MANUAL_SCRAP",
                null,
                null,
                null,
                "Damaged in flood"
        );

        when(partRepository.findById(samplePart.getId())).thenReturn(Optional.of(samplePart));

        assertThatThrownBy(() -> stockMovementService.recordStockMovement(request, sampleUser.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Insufficient stock for part");

        verify(stockMovementRepository, never()).save(any());
        assertThat(samplePart.getCurrentQuantity()).isEqualByComparingTo(BigDecimal.valueOf(5.0));
    }
}


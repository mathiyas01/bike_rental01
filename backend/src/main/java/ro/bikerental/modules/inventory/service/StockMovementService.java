package ro.bikerental.modules.inventory.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
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
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class StockMovementService {

    private final StockMovementRepository stockMovementRepository;
    private final PartRepository partRepository;
    private final AppUserRepository appUserRepository;

    public StockMovementService(StockMovementRepository stockMovementRepository,
                                PartRepository partRepository,
                                AppUserRepository appUserRepository) {
        this.stockMovementRepository = stockMovementRepository;
        this.partRepository = partRepository;
        this.appUserRepository = appUserRepository;
    }

    @Transactional
    public StockMovementDto recordStockMovement(RecordStockMovementRequest request, UUID userId) {
        Part part = partRepository.findById(request.getPartId())
                .orElseThrow(() -> new ResourceNotFoundException("Part", request.getPartId()));

        if (!part.isActive()) {
            throw new BusinessException("Cannot record stock movement for archived part: " + part.getPartCode());
        }

        BigDecimal delta = switch (request.getMovementType()) {
            case STOCK_IN, RETURN -> request.getQuantity().abs();
            case STOCK_OUT, SERVICE_USAGE -> request.getQuantity().abs().negate();
            case ADJUSTMENT, REVERSAL -> request.getQuantity();
        };

        BigDecimal newQuantity = part.getCurrentQuantity().add(delta);
        if (newQuantity.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("Insufficient stock for part " + part.getPartCode() +
                    " (" + part.getName() + "). Current stock: " + part.getCurrentQuantity() +
                    ", requested deduction: " + delta.abs());
        }

        AppUser user = null;
        if (userId != null) {
            user = appUserRepository.findById(userId).orElse(null);
        }
        if (user == null) {
            user = appUserRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new BusinessException("No user found in system to record stock movement"));
        }

        part.setCurrentQuantity(newQuantity);
        partRepository.save(part);

        BigDecimal unitCost = request.getUnitCost() != null ? request.getUnitCost() : part.getDefaultUnitCost();
        String currency = request.getCurrency() != null ? request.getCurrency() : part.getCostCurrency();

        StockMovement movement = new StockMovement(
                part,
                delta,
                request.getMovementType(),
                request.getReferenceType(),
                request.getReferenceId(),
                unitCost,
                currency,
                request.getReason(),
                user
        );

        StockMovement saved = stockMovementRepository.save(movement);
        return StockMovementDto.fromEntity(saved);
    }

    @Transactional(readOnly = true)
    public List<StockMovementDto> getMovementsForPart(UUID partId) {
        return stockMovementRepository.findAllByPartIdOrderByCreatedAtDesc(partId).stream()
                .map(StockMovementDto::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PageResponse<StockMovementDto> searchStockMovements(UUID partId, StockMovementType type,
                                                               Instant startDate, Instant endDate,
                                                               Pageable pageable) {
        Page<StockMovement> page = stockMovementRepository.searchStockMovements(partId, type, startDate, endDate, pageable);
        return new PageResponse<>(page.map(StockMovementDto::fromEntity));
    }
}


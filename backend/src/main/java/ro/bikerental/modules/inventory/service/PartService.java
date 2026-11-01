package ro.bikerental.modules.inventory.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.currency.SupportedCurrency;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;
import ro.bikerental.modules.inventory.dto.CreatePartRequest;
import ro.bikerental.modules.inventory.dto.PartDto;
import ro.bikerental.modules.inventory.dto.UpdatePartRequest;
import ro.bikerental.modules.inventory.entity.Part;
import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;
import ro.bikerental.modules.inventory.entity.Supplier;
import ro.bikerental.modules.inventory.repository.PartRepository;
import ro.bikerental.modules.inventory.repository.StockMovementRepository;
import ro.bikerental.modules.inventory.repository.SupplierRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class PartService {

    private final PartRepository partRepository;
    private final SupplierRepository supplierRepository;
    private final StockMovementRepository stockMovementRepository;
    private final AppUserRepository appUserRepository;

    public PartService(PartRepository partRepository,
                       SupplierRepository supplierRepository,
                       StockMovementRepository stockMovementRepository,
                       AppUserRepository appUserRepository) {
        this.partRepository = partRepository;
        this.supplierRepository = supplierRepository;
        this.stockMovementRepository = stockMovementRepository;
        this.appUserRepository = appUserRepository;
    }

    @Transactional
    public PartDto createPart(CreatePartRequest request, UUID userId) {
        String code = request.getPartCode().toUpperCase().trim();
        if (partRepository.existsByPartCodeIgnoreCase(code)) {
            throw new ConflictException("Part with code '" + code + "' already exists");
        }

        if (!SupportedCurrency.isValid(request.getCostCurrency())) {
            throw new BusinessException("Unsupported currency: " + request.getCostCurrency());
        }

        Supplier supplier = null;
        if (request.getDefaultSupplierId() != null) {
            supplier = supplierRepository.findById(request.getDefaultSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", request.getDefaultSupplierId()));
        }

        Part part = new Part(
                code,
                request.getName().trim(),
                request.getCategory().toUpperCase().trim(),
                request.getDescription(),
                request.getUnitOfMeasure(),
                request.getInitialQuantity(),
                request.getMinReorderLevel(),
                request.getDefaultUnitCost(),
                request.getCostCurrency(),
                supplier
        );

        Part savedPart = partRepository.save(part);

        if (request.getInitialQuantity() != null && request.getInitialQuantity().compareTo(BigDecimal.ZERO) > 0) {
            AppUser user = null;
            if (userId != null) {
                user = appUserRepository.findById(userId).orElse(null);
            }
            if (user == null) {
                user = appUserRepository.findAll().stream().findFirst().orElse(null);
            }

            if (user != null) {
                StockMovement initialStock = new StockMovement(
                        savedPart,
                        request.getInitialQuantity(),
                        StockMovementType.STOCK_IN,
                        "INITIAL_SETUP",
                        null,
                        request.getDefaultUnitCost(),
                        request.getCostCurrency(),
                        "Initial stock on part creation",
                        user
                );
                stockMovementRepository.save(initialStock);
            }
        }

        return PartDto.fromEntity(savedPart);
    }

    @Transactional
    public PartDto updatePart(UUID id, UpdatePartRequest request) {
        Part part = partRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Part", id));

        Supplier supplier = null;
        if (request.getDefaultSupplierId() != null) {
            supplier = supplierRepository.findById(request.getDefaultSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", request.getDefaultSupplierId()));
        }

        part.setName(request.getName().trim());
        part.setCategory(request.getCategory().toUpperCase().trim());
        part.setDescription(request.getDescription());
        part.setUnitOfMeasure(request.getUnitOfMeasure());
        part.setMinReorderLevel(request.getMinReorderLevel());
        part.setDefaultUnitCost(request.getDefaultUnitCost());
        part.setDefaultSupplier(supplier);

        return PartDto.fromEntity(partRepository.save(part));
    }

    @Transactional(readOnly = true)
    public PartDto getPartById(UUID id) {
        Part part = partRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Part", id));
        return PartDto.fromEntity(part);
    }

    @Transactional(readOnly = true)
    public PageResponse<PartDto> listParts(String search, String category, Boolean lowStockOnly,
                                           boolean includeArchived, Pageable pageable) {
        boolean filterLowStock = Boolean.TRUE.equals(lowStockOnly);
        Page<Part> page = partRepository.searchParts(search, category, filterLowStock, includeArchived, pageable);
        return new PageResponse<>(page.map(PartDto::fromEntity));
    }

    @Transactional(readOnly = true)
    public List<PartDto> getLowStockParts() {
        return partRepository.findLowStockParts().stream()
                .map(PartDto::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional
    public PartDto archivePart(UUID id) {
        Part part = partRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Part", id));
        part.setActive(false);
        return PartDto.fromEntity(partRepository.save(part));
    }

    @Transactional
    public PartDto unarchivePart(UUID id) {
        Part part = partRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Part", id));
        part.setActive(true);
        return PartDto.fromEntity(partRepository.save(part));
    }
}


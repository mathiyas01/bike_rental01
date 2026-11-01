package ro.bikerental.modules.inventory.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.inventory.dto.CreateSupplierRequest;
import ro.bikerental.modules.inventory.dto.SupplierDto;
import ro.bikerental.modules.inventory.entity.Supplier;
import ro.bikerental.modules.inventory.repository.SupplierRepository;

import java.util.UUID;

@Service
public class SupplierService {

    private final SupplierRepository supplierRepository;

    public SupplierService(SupplierRepository supplierRepository) {
        this.supplierRepository = supplierRepository;
    }

    @Transactional
    public SupplierDto createSupplier(CreateSupplierRequest request) {
        if (supplierRepository.existsByNameIgnoreCase(request.getName().trim())) {
            throw new ConflictException("Supplier with name '" + request.getName() + "' already exists");
        }

        Supplier supplier = new Supplier(
                request.getName().trim(),
                request.getContactPerson(),
                request.getPhone(),
                request.getEmail(),
                request.getTaxCui(),
                request.getAddress(),
                request.getNotes()
        );

        Supplier saved = supplierRepository.save(supplier);
        return SupplierDto.fromEntity(saved);
    }

    @Transactional(readOnly = true)
    public SupplierDto getSupplierById(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", id));
        return SupplierDto.fromEntity(supplier);
    }

    @Transactional(readOnly = true)
    public PageResponse<SupplierDto> listSuppliers(String search, boolean includeArchived, Pageable pageable) {
        Page<Supplier> page = supplierRepository.searchSuppliers(search, includeArchived, pageable);
        return new PageResponse<>(page.map(SupplierDto::fromEntity));
    }

    @Transactional
    public SupplierDto archiveSupplier(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", id));
        supplier.setActive(false);
        return SupplierDto.fromEntity(supplierRepository.save(supplier));
    }

    @Transactional
    public SupplierDto unarchiveSupplier(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", id));
        supplier.setActive(true);
        return SupplierDto.fromEntity(supplierRepository.save(supplier));
    }
}


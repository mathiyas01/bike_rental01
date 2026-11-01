package ro.bikerental.modules.inventory.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.inventory.dto.CreateSupplierRequest;
import ro.bikerental.modules.inventory.dto.SupplierDto;
import ro.bikerental.modules.inventory.service.SupplierService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/suppliers")
@Tag(name = "Suppliers", description = "Spare parts vendor and supplier directory")
public class SupplierController {

    private final SupplierService supplierService;

    public SupplierController(SupplierService supplierService) {
        this.supplierService = supplierService;
    }

    @PostMapping
    @Operation(summary = "Register a new spare-parts supplier")
    public ResponseEntity<SupplierDto> createSupplier(@Valid @RequestBody CreateSupplierRequest request) {
        SupplierDto created = supplierService.createSupplier(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    @Operation(summary = "Search and list suppliers with pagination")
    public ResponseEntity<PageResponse<SupplierDto>> listSuppliers(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "false") boolean includeArchived,
            @PageableDefault(size = 20, sort = "name", direction = Sort.Direction.ASC) Pageable pageable) {
        return ResponseEntity.ok(supplierService.listSuppliers(search, includeArchived, pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get supplier details by ID")
    public ResponseEntity<SupplierDto> getSupplier(@PathVariable UUID id) {
        return ResponseEntity.ok(supplierService.getSupplierById(id));
    }

    @PostMapping("/{id}/archive")
    @Operation(summary = "Archive supplier")
    public ResponseEntity<SupplierDto> archiveSupplier(@PathVariable UUID id) {
        return ResponseEntity.ok(supplierService.archiveSupplier(id));
    }

    @PostMapping("/{id}/unarchive")
    @Operation(summary = "Restore archived supplier")
    public ResponseEntity<SupplierDto> unarchiveSupplier(@PathVariable UUID id) {
        return ResponseEntity.ok(supplierService.unarchiveSupplier(id));
    }
}


package ro.bikerental.modules.inventory.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.common.security.UserPrincipal;
import ro.bikerental.modules.inventory.dto.CreatePartRequest;
import ro.bikerental.modules.inventory.dto.PartDto;
import ro.bikerental.modules.inventory.dto.UpdatePartRequest;
import ro.bikerental.modules.inventory.service.PartService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/parts")
@Tag(name = "Parts Inventory", description = "Spare-parts catalog, stock tracking, and reorder alerts")
public class PartController {

    private final PartService partService;

    public PartController(PartService partService) {
        this.partService = partService;
    }

    @PostMapping
    @Operation(summary = "Add a new spare part to the inventory catalog")
    public ResponseEntity<PartDto> createPart(
            @Valid @RequestBody CreatePartRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        UUID userId = userPrincipal != null ? userPrincipal.getId() : null;
        PartDto created = partService.createPart(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update spare part details")
    public ResponseEntity<PartDto> updatePart(
            @PathVariable UUID id,
            @Valid @RequestBody UpdatePartRequest request) {
        return ResponseEntity.ok(partService.updatePart(id, request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get spare part details by ID")
    public ResponseEntity<PartDto> getPart(@PathVariable UUID id) {
        return ResponseEntity.ok(partService.getPartById(id));
    }

    @GetMapping
    @Operation(summary = "Search and list spare parts with category and low-stock filters")
    public ResponseEntity<PageResponse<PartDto>> listParts(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Boolean lowStockOnly,
            @RequestParam(defaultValue = "false") boolean includeArchived,
            @PageableDefault(size = 20, sort = "partCode", direction = Sort.Direction.ASC) Pageable pageable) {
        return ResponseEntity.ok(partService.listParts(search, category, lowStockOnly, includeArchived, pageable));
    }

    @GetMapping("/low-stock")
    @Operation(summary = "Get all parts that are currently at or below minimum reorder level")
    public ResponseEntity<List<PartDto>> getLowStockParts() {
        return ResponseEntity.ok(partService.getLowStockParts());
    }

    @PostMapping("/{id}/archive")
    @Operation(summary = "Archive spare part")
    public ResponseEntity<PartDto> archivePart(@PathVariable UUID id) {
        return ResponseEntity.ok(partService.archivePart(id));
    }

    @PostMapping("/{id}/unarchive")
    @Operation(summary = "Restore archived spare part")
    public ResponseEntity<PartDto> unarchivePart(@PathVariable UUID id) {
        return ResponseEntity.ok(partService.unarchivePart(id));
    }
}


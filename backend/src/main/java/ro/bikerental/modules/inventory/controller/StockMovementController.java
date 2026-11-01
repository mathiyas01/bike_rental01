package ro.bikerental.modules.inventory.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.common.security.UserPrincipal;
import ro.bikerental.modules.inventory.dto.RecordStockMovementRequest;
import ro.bikerental.modules.inventory.dto.StockMovementDto;
import ro.bikerental.modules.inventory.entity.StockMovementType;
import ro.bikerental.modules.inventory.service.StockMovementService;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/stock-movements")
@Tag(name = "Stock Ledger", description = "Immutable double-entry stock movement log")
public class StockMovementController {

    private final StockMovementService stockMovementService;

    public StockMovementController(StockMovementService stockMovementService) {
        this.stockMovementService = stockMovementService;
    }

    @PostMapping
    @Operation(summary = "Record a manual stock movement (stock in, stock out, adjustment, return)")
    public ResponseEntity<StockMovementDto> recordStockMovement(
            @Valid @RequestBody RecordStockMovementRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        UUID userId = userPrincipal != null ? userPrincipal.getId() : null;
        StockMovementDto recorded = stockMovementService.recordStockMovement(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(recorded);
    }

    @GetMapping("/part/{partId}")
    @Operation(summary = "Get complete stock movement audit history for a specific part")
    public ResponseEntity<List<StockMovementDto>> getMovementsForPart(@PathVariable UUID partId) {
        return ResponseEntity.ok(stockMovementService.getMovementsForPart(partId));
    }

    @GetMapping
    @Operation(summary = "Search and filter stock movements across all parts with pagination")
    public ResponseEntity<PageResponse<StockMovementDto>> searchStockMovements(
            @RequestParam(required = false) UUID partId,
            @RequestParam(required = false) StockMovementType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant endDate,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(stockMovementService.searchStockMovements(partId, type, startDate, endDate, pageable));
    }
}


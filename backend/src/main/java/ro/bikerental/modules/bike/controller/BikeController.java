package ro.bikerental.modules.bike.controller;

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
import ro.bikerental.modules.bike.dto.BikeDto;
import ro.bikerental.modules.bike.dto.CreateBikeRequest;
import ro.bikerental.modules.bike.dto.UpdateBikeRequest;
import ro.bikerental.modules.bike.dto.UpdateBikeStatusRequest;
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.service.BikeService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/bikes")
@Tag(name = "Motorbikes", description = "Motorbike fleet management, registration, and status lifecycle")
public class BikeController {

    private final BikeService bikeService;

    public BikeController(BikeService bikeService) {
        this.bikeService = bikeService;
    }

    @PostMapping
    @Operation(summary = "Register a new motorbike in the fleet")
    public ResponseEntity<BikeDto> createBike(@Valid @RequestBody CreateBikeRequest request) {
        BikeDto created = bikeService.createBike(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    @Operation(summary = "Search and list motorbikes with status filtering")
    public ResponseEntity<PageResponse<BikeDto>> listBikes(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) BikeStatus status,
            @RequestParam(defaultValue = "false") boolean includeArchived,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(bikeService.listBikes(search, status, includeArchived, pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get motorbike details by ID")
    public ResponseEntity<BikeDto> getBike(@PathVariable UUID id) {
        return ResponseEntity.ok(bikeService.getBikeById(id));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update motorbike details")
    public ResponseEntity<BikeDto> updateBike(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateBikeRequest request) {
        return ResponseEntity.ok(bikeService.updateBike(id, request));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Update motorbike operational status")
    public ResponseEntity<BikeDto> updateBikeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateBikeStatusRequest request) {
        return ResponseEntity.ok(bikeService.updateBikeStatus(id, request.getStatus()));
    }

    @PostMapping("/{id}/archive")
    @Operation(summary = "Archive motorbike (sets status to INACTIVE)")
    public ResponseEntity<BikeDto> archiveBike(@PathVariable UUID id) {
        return ResponseEntity.ok(bikeService.archiveBike(id));
    }

    @PostMapping("/{id}/unarchive")
    @Operation(summary = "Restore archived motorbike")
    public ResponseEntity<BikeDto> unarchiveBike(@PathVariable UUID id) {
        return ResponseEntity.ok(bikeService.unarchiveBike(id));
    }
}

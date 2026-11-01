package ro.bikerental.modules.rental.controller;

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
import ro.bikerental.modules.rental.dto.CloseRentalRequest;
import ro.bikerental.modules.rental.dto.CreateRentalRequest;
import ro.bikerental.modules.rental.dto.RentalDto;
import ro.bikerental.modules.rental.entity.RentalStatus;
import ro.bikerental.modules.rental.service.RentalService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rentals")
@Tag(name = "Rentals", description = "Rental contract lifecycle and motorbike assignment")
public class RentalController {

    private final RentalService rentalService;

    public RentalController(RentalService rentalService) {
        this.rentalService = rentalService;
    }

    @PostMapping
    @Operation(summary = "Create a new rental agreement (allocates bike and generates initial charge)")
    public ResponseEntity<RentalDto> createRental(@Valid @RequestBody CreateRentalRequest request) {
        RentalDto created = rentalService.createRental(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PostMapping("/{id}/close")
    @Operation(summary = "Close an active rental agreement (restores bike to AVAILABLE)")
    public ResponseEntity<RentalDto> closeRental(
            @PathVariable UUID id,
            @Valid @RequestBody CloseRentalRequest request) {
        return ResponseEntity.ok(rentalService.closeRental(id, request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get rental agreement details by ID")
    public ResponseEntity<RentalDto> getRental(@PathVariable UUID id) {
        return ResponseEntity.ok(rentalService.getRentalById(id));
    }

    @GetMapping
    @Operation(summary = "List and filter rental agreements")
    public ResponseEntity<PageResponse<RentalDto>> listRentals(
            @RequestParam(required = false) RentalStatus status,
            @RequestParam(required = false) UUID customerId,
            @RequestParam(required = false) UUID bikeId,
            @PageableDefault(size = 20, sort = "startDate", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(rentalService.listRentals(status, customerId, bikeId, pageable));
    }
}

package ro.bikerental.modules.rental.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.rental.dto.RentalChargeDto;
import ro.bikerental.modules.rental.entity.ChargeStatus;
import ro.bikerental.modules.rental.service.RentalChargeService;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/rental-charges")
@Tag(name = "Rental Charges", description = "Weekly rent schedule, charge generation, and debt tracking")
public class RentalChargeController {

    private final RentalChargeService rentalChargeService;

    public RentalChargeController(RentalChargeService rentalChargeService) {
        this.rentalChargeService = rentalChargeService;
    }

    @PostMapping("/rental/{rentalId}/generate-next")
    @Operation(summary = "Generate the next weekly charge for an active rental")
    public ResponseEntity<RentalChargeDto> generateNextWeeklyCharge(@PathVariable UUID rentalId) {
        RentalChargeDto charge = rentalChargeService.generateNextWeeklyCharge(rentalId);
        return ResponseEntity.status(HttpStatus.CREATED).body(charge);
    }

    @PostMapping("/rental/{rentalId}/generate-up-to-date")
    @Operation(summary = "Generate all recurring charges up to a target date")
    public ResponseEntity<List<RentalChargeDto>> generateChargesUpToDate(
            @PathVariable UUID rentalId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate targetDate) {
        List<RentalChargeDto> charges = rentalChargeService.generateChargesUpToDate(rentalId, targetDate);
        return ResponseEntity.status(HttpStatus.CREATED).body(charges);
    }

    @GetMapping("/rental/{rentalId}")
    @Operation(summary = "Get all charges for a specific rental agreement with paid/remaining amounts")
    public ResponseEntity<List<RentalChargeDto>> getChargesForRental(@PathVariable UUID rentalId) {
        return ResponseEntity.ok(rentalChargeService.getChargesForRental(rentalId));
    }

    @GetMapping("/due")
    @Operation(summary = "Get overdue or due charges across all active rentals as of a given date")
    public ResponseEntity<List<RentalChargeDto>> getOverdueOrDueCharges(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        return ResponseEntity.ok(rentalChargeService.getOverdueOrDueCharges(asOfDate));
    }

    @GetMapping
    @Operation(summary = "Search and filter rental charges with pagination")
    public ResponseEntity<PageResponse<RentalChargeDto>> searchCharges(
            @RequestParam(required = false) ChargeStatus status,
            @RequestParam(required = false) String currency,
            @RequestParam(required = false) UUID customerId,
            @RequestParam(required = false) UUID rentalId,
            @PageableDefault(size = 20, sort = "dueDate", direction = Sort.Direction.ASC) Pageable pageable) {
        return ResponseEntity.ok(rentalChargeService.searchCharges(status, currency, customerId, rentalId, pageable));
    }
}

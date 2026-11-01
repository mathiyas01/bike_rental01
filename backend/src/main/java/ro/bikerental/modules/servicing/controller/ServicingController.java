package ro.bikerental.modules.servicing.controller;

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
import ro.bikerental.modules.servicing.dto.LogServiceRequest;
import ro.bikerental.modules.servicing.dto.ServiceRecordDto;
import ro.bikerental.modules.servicing.entity.ServiceStatus;
import ro.bikerental.modules.servicing.service.ServicingService;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/services")
@Tag(name = "Servicing", description = "Motorbike maintenance logging, spare parts deduction, and service schedule tracking")
public class ServicingController {

    private final ServicingService servicingService;

    public ServicingController(ServicingService servicingService) {
        this.servicingService = servicingService;
    }

    @PostMapping
    @Operation(summary = "Log maintenance service with automatic spare parts deduction and odometer update")
    public ResponseEntity<ServiceRecordDto> logService(
            @Valid @RequestBody LogServiceRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        UUID userId = userPrincipal != null ? userPrincipal.getId() : null;
        ServiceRecordDto record = servicingService.logService(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(record);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get service record details by ID including parts used and costs")
    public ResponseEntity<ServiceRecordDto> getService(@PathVariable UUID id) {
        return ResponseEntity.ok(servicingService.getServiceById(id));
    }

    @GetMapping("/bike/{bikeId}")
    @Operation(summary = "Get complete maintenance history for a specific motorbike")
    public ResponseEntity<List<ServiceRecordDto>> getServicesForBike(@PathVariable UUID bikeId) {
        return ResponseEntity.ok(servicingService.getServicesForBike(bikeId));
    }

    @GetMapping
    @Operation(summary = "Search and filter service records with pagination")
    public ResponseEntity<PageResponse<ServiceRecordDto>> searchServices(
            @RequestParam(required = false) UUID bikeId,
            @RequestParam(required = false) ServiceStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @PageableDefault(size = 20, sort = "serviceDate", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(servicingService.searchServices(bikeId, status, startDate, endDate, pageable));
    }

    @GetMapping("/due")
    @Operation(summary = "Get upcoming or overdue scheduled maintenance as of a target date")
    public ResponseEntity<List<ServiceRecordDto>> getDueServices(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        return ResponseEntity.ok(servicingService.getDueServices(asOfDate));
    }
}


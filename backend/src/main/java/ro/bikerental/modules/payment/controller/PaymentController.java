package ro.bikerental.modules.payment.controller;

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
import ro.bikerental.modules.payment.dto.CustomerBalanceSummaryDto;
import ro.bikerental.modules.payment.dto.PaymentDto;
import ro.bikerental.modules.payment.dto.RecordPaymentRequest;
import ro.bikerental.modules.payment.dto.ReversePaymentRequest;
import ro.bikerental.modules.payment.entity.PaymentMethod;
import ro.bikerental.modules.payment.entity.PaymentStatus;
import ro.bikerental.modules.payment.service.PaymentService;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
@Tag(name = "Payments", description = "Manual payment recording (cash/bank), FIFO/manual charge allocation, reversals, and balance summaries")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping
    @Operation(summary = "Record a manual cash or bank transfer payment with charge allocations")
    public ResponseEntity<PaymentDto> recordPayment(
            @Valid @RequestBody RecordPaymentRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        UUID userId = userPrincipal != null ? userPrincipal.getId() : null;
        PaymentDto payment = paymentService.recordPayment(request, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(payment);
    }

    @PostMapping("/{id}/reverse")
    @Operation(summary = "Reverse an existing payment (restores debt on linked charges and logs audit trail)")
    public ResponseEntity<PaymentDto> reversePayment(
            @PathVariable UUID id,
            @Valid @RequestBody ReversePaymentRequest request,
            @AuthenticationPrincipal UserPrincipal userPrincipal) {
        UUID userId = userPrincipal != null ? userPrincipal.getId() : null;
        PaymentDto reversed = paymentService.reversePayment(id, request, userId);
        return ResponseEntity.ok(reversed);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get payment details by ID including allocations and reversal info")
    public ResponseEntity<PaymentDto> getPayment(@PathVariable UUID id) {
        return ResponseEntity.ok(paymentService.getPaymentById(id));
    }

    @GetMapping
    @Operation(summary = "Search and filter payments with pagination")
    public ResponseEntity<PageResponse<PaymentDto>> searchPayments(
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(required = false) String currency,
            @RequestParam(required = false) PaymentMethod method,
            @RequestParam(required = false) UUID customerId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @PageableDefault(size = 20, sort = "paymentDate", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(paymentService.searchPayments(status, currency, method, customerId, startDate, endDate, pageable));
    }

    @GetMapping("/customer/{customerId}")
    @Operation(summary = "Get all payments made by a customer")
    public ResponseEntity<List<PaymentDto>> getPaymentsForCustomer(@PathVariable UUID customerId) {
        return ResponseEntity.ok(paymentService.getPaymentsForCustomer(customerId));
    }

    @GetMapping("/rental/{rentalId}")
    @Operation(summary = "Get all payments associated with a rental agreement")
    public ResponseEntity<List<PaymentDto>> getPaymentsForRental(@PathVariable UUID rentalId) {
        return ResponseEntity.ok(paymentService.getPaymentsForRental(rentalId));
    }

    @GetMapping("/balance-summary/{customerId}")
    @Operation(summary = "Get customer financial balance summary broken down by RON, EUR, and USD")
    public ResponseEntity<CustomerBalanceSummaryDto> getCustomerBalanceSummary(@PathVariable UUID customerId) {
        return ResponseEntity.ok(paymentService.getCustomerBalanceSummary(customerId));
    }
}

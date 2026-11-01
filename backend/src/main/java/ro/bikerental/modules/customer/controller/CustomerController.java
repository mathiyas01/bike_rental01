package ro.bikerental.modules.customer.controller;

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
import ro.bikerental.modules.customer.dto.CreateCustomerRequest;
import ro.bikerental.modules.customer.dto.CustomerDto;
import ro.bikerental.modules.customer.dto.UpdateCustomerRequest;
import ro.bikerental.modules.customer.service.CustomerService;
import ro.bikerental.modules.payment.dto.CustomerBalanceSummaryDto;
import ro.bikerental.modules.payment.service.PaymentService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/customers")
@Tag(name = "Customers", description = "Customer profile management and driving licence tracking")
public class CustomerController {

    private final CustomerService customerService;
    private final PaymentService paymentService;

    public CustomerController(CustomerService customerService, PaymentService paymentService) {
        this.customerService = customerService;
        this.paymentService = paymentService;
    }

    @PostMapping
    @Operation(summary = "Register a new customer")
    public ResponseEntity<CustomerDto> createCustomer(@Valid @RequestBody CreateCustomerRequest request) {
        CustomerDto created = customerService.createCustomer(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping
    @Operation(summary = "Search and paginate customers")
    public ResponseEntity<PageResponse<CustomerDto>> listCustomers(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "false") boolean includeArchived,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(customerService.listCustomers(search, includeArchived, pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get customer details by ID")
    public ResponseEntity<CustomerDto> getCustomer(@PathVariable UUID id) {
        return ResponseEntity.ok(customerService.getCustomerById(id));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update customer details")
    public ResponseEntity<CustomerDto> updateCustomer(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateCustomerRequest request) {
        return ResponseEntity.ok(customerService.updateCustomer(id, request));
    }

    @PostMapping("/{id}/archive")
    @Operation(summary = "Soft-archive customer (GDPR compliant, preserving financial history)")
    public ResponseEntity<CustomerDto> archiveCustomer(@PathVariable UUID id) {
        return ResponseEntity.ok(customerService.archiveCustomer(id));
    }

    @PostMapping("/{id}/unarchive")
    @Operation(summary = "Restore archived customer")
    public ResponseEntity<CustomerDto> unarchiveCustomer(@PathVariable UUID id) {
        return ResponseEntity.ok(customerService.unarchiveCustomer(id));
    }

    @GetMapping("/{id}/balance-summary")
    @Operation(summary = "Get customer financial balance summary broken down by currency (RON, EUR, USD)")
    public ResponseEntity<CustomerBalanceSummaryDto> getCustomerBalanceSummary(@PathVariable UUID id) {
        return ResponseEntity.ok(paymentService.getCustomerBalanceSummary(id));
    }
}

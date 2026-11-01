package ro.bikerental.modules.payment.dto;

import jakarta.validation.constraints.*;
import ro.bikerental.modules.payment.entity.PaymentMethod;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class RecordPaymentRequest {

    @NotNull(message = "Customer ID is required")
    private UUID customerId;

    private UUID rentalId;

    @NotNull(message = "Payment date is required")
    private LocalDate paymentDate;

    @NotNull(message = "Payment amount is required")
    @DecimalMin(value = "0.01", message = "Payment amount must be greater than 0")
    private BigDecimal amount;

    @NotBlank(message = "Currency is required")
    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Currency must be one of: RON, EUR, USD")
    private String currency;

    @NotNull(message = "Payment method is required")
    private PaymentMethod paymentMethod;

    private String referenceNumber;

    private String notes;

    private String allocationMode = "AUTO_FIFO"; // AUTO_FIFO or MANUAL

    private List<ManualAllocationItem> manualAllocations = new ArrayList<>();

    public RecordPaymentRequest() {}

    public RecordPaymentRequest(UUID customerId, UUID rentalId, LocalDate paymentDate, BigDecimal amount,
                                String currency, PaymentMethod paymentMethod, String referenceNumber,
                                String notes, String allocationMode, List<ManualAllocationItem> manualAllocations) {
        this.customerId = customerId;
        this.rentalId = rentalId;
        this.paymentDate = paymentDate;
        this.amount = amount;
        this.currency = currency;
        this.paymentMethod = paymentMethod;
        this.referenceNumber = referenceNumber;
        this.notes = notes;
        this.allocationMode = allocationMode != null ? allocationMode : "AUTO_FIFO";
        this.manualAllocations = manualAllocations != null ? manualAllocations : new ArrayList<>();
    }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public UUID getRentalId() { return rentalId; }
    public void setRentalId(UUID rentalId) { this.rentalId = rentalId; }

    public LocalDate getPaymentDate() { return paymentDate; }
    public void setPaymentDate(LocalDate paymentDate) { this.paymentDate = paymentDate; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public PaymentMethod getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(PaymentMethod paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getReferenceNumber() { return referenceNumber; }
    public void setReferenceNumber(String referenceNumber) { this.referenceNumber = referenceNumber; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getAllocationMode() { return allocationMode; }
    public void setAllocationMode(String allocationMode) { this.allocationMode = allocationMode; }

    public List<ManualAllocationItem> getManualAllocations() { return manualAllocations; }
    public void setManualAllocations(List<ManualAllocationItem> manualAllocations) { this.manualAllocations = manualAllocations; }
}

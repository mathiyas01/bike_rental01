package ro.bikerental.modules.payment.dto;

import ro.bikerental.modules.payment.entity.Payment;
import ro.bikerental.modules.payment.entity.PaymentMethod;
import ro.bikerental.modules.payment.entity.PaymentReversal;
import ro.bikerental.modules.payment.entity.PaymentStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

public class PaymentDto {
    private UUID id;
    private UUID customerId;
    private String customerName;
    private UUID rentalId;
    private LocalDate paymentDate;
    private BigDecimal amount;
    private String currency;
    private PaymentMethod paymentMethod;
    private String referenceNumber;
    private String notes;
    private PaymentStatus status;
    private String recordedByUserName;
    private List<PaymentAllocationDto> allocations = new ArrayList<>();
    private String reversalReason;
    private Instant reversedAt;
    private Instant createdAt;

    public PaymentDto() {}

    public static PaymentDto fromEntity(Payment payment, PaymentReversal reversal) {
        PaymentDto dto = new PaymentDto();
        dto.setId(payment.getId());
        dto.setCustomerId(payment.getCustomer().getId());
        dto.setCustomerName(payment.getCustomer().getFullName());
        dto.setRentalId(payment.getRental() != null ? payment.getRental().getId() : null);
        dto.setPaymentDate(payment.getPaymentDate());
        dto.setAmount(payment.getAmount());
        dto.setCurrency(payment.getCurrency());
        dto.setPaymentMethod(payment.getPaymentMethod());
        dto.setReferenceNumber(payment.getReferenceNumber());
        dto.setNotes(payment.getNotes());
        dto.setStatus(payment.getStatus());
        dto.setRecordedByUserName(payment.getRecordedByUser().getFullName());
        if (payment.getAllocations() != null) {
            dto.setAllocations(payment.getAllocations().stream()
                    .map(PaymentAllocationDto::fromEntity)
                    .collect(Collectors.toList()));
        }
        if (reversal != null) {
            dto.setReversalReason(reversal.getReason());
            dto.setReversedAt(reversal.getReversedAt());
        }
        dto.setCreatedAt(payment.getCreatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

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

    public PaymentStatus getStatus() { return status; }
    public void setStatus(PaymentStatus status) { this.status = status; }

    public String getRecordedByUserName() { return recordedByUserName; }
    public void setRecordedByUserName(String recordedByUserName) { this.recordedByUserName = recordedByUserName; }

    public List<PaymentAllocationDto> getAllocations() { return allocations; }
    public void setAllocations(List<PaymentAllocationDto> allocations) { this.allocations = allocations; }

    public String getReversalReason() { return reversalReason; }
    public void setReversalReason(String reversalReason) { this.reversalReason = reversalReason; }

    public Instant getReversedAt() { return reversedAt; }
    public void setReversedAt(Instant reversedAt) { this.reversedAt = reversedAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

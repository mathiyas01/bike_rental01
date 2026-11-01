package ro.bikerental.modules.payment.dto;

import ro.bikerental.modules.payment.entity.PaymentAllocation;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public class PaymentAllocationDto {
    private UUID id;
    private UUID paymentId;
    private UUID rentalChargeId;
    private int chargeSequence;
    private LocalDate chargeDueDate;
    private BigDecimal allocatedAmount;
    private String currency;
    private Instant allocatedAt;

    public PaymentAllocationDto() {}

    public static PaymentAllocationDto fromEntity(PaymentAllocation alloc) {
        PaymentAllocationDto dto = new PaymentAllocationDto();
        dto.setId(alloc.getId());
        dto.setPaymentId(alloc.getPayment().getId());
        dto.setRentalChargeId(alloc.getRentalCharge().getId());
        dto.setChargeSequence(alloc.getRentalCharge().getChargeSequence());
        dto.setChargeDueDate(alloc.getRentalCharge().getDueDate());
        dto.setAllocatedAmount(alloc.getAllocatedAmount());
        dto.setCurrency(alloc.getCurrency());
        dto.setAllocatedAt(alloc.getAllocatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getPaymentId() { return paymentId; }
    public void setPaymentId(UUID paymentId) { this.paymentId = paymentId; }

    public UUID getRentalChargeId() { return rentalChargeId; }
    public void setRentalChargeId(UUID rentalChargeId) { this.rentalChargeId = rentalChargeId; }

    public int getChargeSequence() { return chargeSequence; }
    public void setChargeSequence(int chargeSequence) { this.chargeSequence = chargeSequence; }

    public LocalDate getChargeDueDate() { return chargeDueDate; }
    public void setChargeDueDate(LocalDate chargeDueDate) { this.chargeDueDate = chargeDueDate; }

    public BigDecimal getAllocatedAmount() { return allocatedAmount; }
    public void setAllocatedAmount(BigDecimal allocatedAmount) { this.allocatedAmount = allocatedAmount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public Instant getAllocatedAt() { return allocatedAt; }
    public void setAllocatedAt(Instant allocatedAt) { this.allocatedAt = allocatedAt; }
}

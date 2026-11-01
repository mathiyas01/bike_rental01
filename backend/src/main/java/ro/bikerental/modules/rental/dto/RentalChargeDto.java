package ro.bikerental.modules.rental.dto;

import ro.bikerental.modules.rental.entity.ChargeStatus;
import ro.bikerental.modules.rental.entity.RentalCharge;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public class RentalChargeDto {
    private UUID id;
    private UUID rentalId;
    private int chargeSequence;
    private LocalDate periodStartDate;
    private LocalDate periodEndDate;
    private LocalDate dueDate;
    private BigDecimal amount;
    private String currency;
    private ChargeStatus status;
    private BigDecimal paidAmount;
    private BigDecimal remainingAmount;
    private String notes;
    private Instant createdAt;

    public RentalChargeDto() {}

    public static RentalChargeDto fromEntity(RentalCharge charge, BigDecimal paidAmount) {
        RentalChargeDto dto = new RentalChargeDto();
        dto.setId(charge.getId());
        dto.setRentalId(charge.getRental().getId());
        dto.setChargeSequence(charge.getChargeSequence());
        dto.setPeriodStartDate(charge.getPeriodStartDate());
        dto.setPeriodEndDate(charge.getPeriodEndDate());
        dto.setDueDate(charge.getDueDate());
        dto.setAmount(charge.getAmount());
        dto.setCurrency(charge.getCurrency());
        dto.setStatus(charge.getStatus());
        BigDecimal paid = paidAmount != null ? paidAmount : BigDecimal.ZERO;
        dto.setPaidAmount(paid);
        dto.setRemainingAmount(charge.getAmount().subtract(paid).max(BigDecimal.ZERO));
        dto.setNotes(charge.getNotes());
        dto.setCreatedAt(charge.getCreatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getRentalId() { return rentalId; }
    public void setRentalId(UUID rentalId) { this.rentalId = rentalId; }

    public int getChargeSequence() { return chargeSequence; }
    public void setChargeSequence(int chargeSequence) { this.chargeSequence = chargeSequence; }

    public LocalDate getPeriodStartDate() { return periodStartDate; }
    public void setPeriodStartDate(LocalDate periodStartDate) { this.periodStartDate = periodStartDate; }

    public LocalDate getPeriodEndDate() { return periodEndDate; }
    public void setPeriodEndDate(LocalDate periodEndDate) { this.periodEndDate = periodEndDate; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public ChargeStatus getStatus() { return status; }
    public void setStatus(ChargeStatus status) { this.status = status; }

    public BigDecimal getPaidAmount() { return paidAmount; }
    public void setPaidAmount(BigDecimal paidAmount) { this.paidAmount = paidAmount; }

    public BigDecimal getRemainingAmount() { return remainingAmount; }
    public void setRemainingAmount(BigDecimal remainingAmount) { this.remainingAmount = remainingAmount; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

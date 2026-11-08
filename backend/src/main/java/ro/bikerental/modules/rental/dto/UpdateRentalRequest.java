package ro.bikerental.modules.rental.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public class UpdateRentalRequest {

    @NotNull(message = "Motorbike ID is required")
    private UUID motorbikeId;

    @NotNull(message = "Start date is required")
    private LocalDate startDate;

    private LocalDate plannedEndDate;

    @NotNull(message = "Weekly rental rate is required")
    @DecimalMin(value = "0.01", message = "Weekly rate must be greater than 0")
    private BigDecimal weeklyRate;

    @NotNull(message = "Currency is required")
    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Currency must be one of: RON, EUR, USD")
    private String currency;

    @DecimalMin(value = "0.00", message = "Deposit amount cannot be negative")
    private BigDecimal depositAmount;

    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Deposit currency must be one of: RON, EUR, USD")
    private String depositCurrency;

    private String termsAndNotes;

    public UUID getMotorbikeId() { return motorbikeId; }
    public void setMotorbikeId(UUID motorbikeId) { this.motorbikeId = motorbikeId; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getPlannedEndDate() { return plannedEndDate; }
    public void setPlannedEndDate(LocalDate plannedEndDate) { this.plannedEndDate = plannedEndDate; }
    public BigDecimal getWeeklyRate() { return weeklyRate; }
    public void setWeeklyRate(BigDecimal weeklyRate) { this.weeklyRate = weeklyRate; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public BigDecimal getDepositAmount() { return depositAmount; }
    public void setDepositAmount(BigDecimal depositAmount) { this.depositAmount = depositAmount; }
    public String getDepositCurrency() { return depositCurrency; }
    public void setDepositCurrency(String depositCurrency) { this.depositCurrency = depositCurrency; }
    public String getTermsAndNotes() { return termsAndNotes; }
    public void setTermsAndNotes(String termsAndNotes) { this.termsAndNotes = termsAndNotes; }
}

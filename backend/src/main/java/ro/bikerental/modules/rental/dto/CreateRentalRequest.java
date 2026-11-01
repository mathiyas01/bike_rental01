package ro.bikerental.modules.rental.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public class CreateRentalRequest {

    @NotNull(message = "Customer ID is required")
    private UUID customerId;

    @NotNull(message = "Motorbike ID is required")
    private UUID motorbikeId;

    @NotNull(message = "Start date is required")
    private LocalDate startDate;

    private LocalDate plannedEndDate;

    @NotNull(message = "Weekly rental rate is required")
    @DecimalMin(value = "0.01", message = "Weekly rate must be greater than 0")
    private BigDecimal weeklyRate;

    @NotBlank(message = "Currency is required")
    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Currency must be one of: RON, EUR, USD")
    private String currency;

    @DecimalMin(value = "0.00", message = "Deposit amount cannot be negative")
    private BigDecimal depositAmount = BigDecimal.ZERO;

    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Deposit currency must be one of: RON, EUR, USD")
    private String depositCurrency;

    private String scheduleAnchorDay = "START_DAY";

    private String termsAndNotes;

    public CreateRentalRequest() {}

    public CreateRentalRequest(UUID customerId, UUID motorbikeId, LocalDate startDate, LocalDate plannedEndDate,
                               BigDecimal weeklyRate, String currency, BigDecimal depositAmount,
                               String depositCurrency, String scheduleAnchorDay, String termsAndNotes) {
        this.customerId = customerId;
        this.motorbikeId = motorbikeId;
        this.startDate = startDate;
        this.plannedEndDate = plannedEndDate;
        this.weeklyRate = weeklyRate;
        this.currency = currency;
        this.depositAmount = depositAmount != null ? depositAmount : BigDecimal.ZERO;
        this.depositCurrency = depositCurrency != null ? depositCurrency : currency;
        this.scheduleAnchorDay = scheduleAnchorDay != null ? scheduleAnchorDay : "START_DAY";
        this.termsAndNotes = termsAndNotes;
    }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

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

    public String getScheduleAnchorDay() { return scheduleAnchorDay; }
    public void setScheduleAnchorDay(String scheduleAnchorDay) { this.scheduleAnchorDay = scheduleAnchorDay; }

    public String getTermsAndNotes() { return termsAndNotes; }
    public void setTermsAndNotes(String termsAndNotes) { this.termsAndNotes = termsAndNotes; }
}

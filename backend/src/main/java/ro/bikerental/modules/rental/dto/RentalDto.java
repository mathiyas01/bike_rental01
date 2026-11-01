package ro.bikerental.modules.rental.dto;

import ro.bikerental.modules.rental.entity.Rental;
import ro.bikerental.modules.rental.entity.RentalStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public class RentalDto {
    private UUID id;
    private UUID customerId;
    private String customerName;
    private String customerPhone;
    private UUID bikeId;
    private String bikeRegistrationNumber;
    private String bikeMakeModel;
    private LocalDate startDate;
    private LocalDate plannedEndDate;
    private LocalDate actualClosedDate;
    private BigDecimal weeklyRate;
    private String currency;
    private BigDecimal depositAmount;
    private String depositCurrency;
    private String paymentFrequency;
    private String scheduleAnchorDay;
    private RentalStatus status;
    private String termsAndNotes;
    private Instant createdAt;

    public RentalDto() {}

    public static RentalDto fromEntity(Rental rental) {
        RentalDto dto = new RentalDto();
        dto.setId(rental.getId());
        dto.setCustomerId(rental.getCustomer().getId());
        dto.setCustomerName(rental.getCustomer().getFullName());
        dto.setCustomerPhone(rental.getCustomer().getPhone());
        dto.setBikeId(rental.getBike().getId());
        dto.setBikeRegistrationNumber(rental.getBike().getRegistrationNumber());
        dto.setBikeMakeModel(rental.getBike().getMake() + " " + rental.getBike().getModel());
        dto.setStartDate(rental.getStartDate());
        dto.setPlannedEndDate(rental.getPlannedEndDate());
        dto.setActualClosedDate(rental.getActualClosedDate());
        dto.setWeeklyRate(rental.getWeeklyRate());
        dto.setCurrency(rental.getCurrency());
        dto.setDepositAmount(rental.getDepositAmount());
        dto.setDepositCurrency(rental.getDepositCurrency());
        dto.setPaymentFrequency(rental.getPaymentFrequency());
        dto.setScheduleAnchorDay(rental.getScheduleAnchorDay());
        dto.setStatus(rental.getStatus());
        dto.setTermsAndNotes(rental.getTermsAndNotes());
        dto.setCreatedAt(rental.getCreatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }

    public UUID getBikeId() { return bikeId; }
    public void setBikeId(UUID bikeId) { this.bikeId = bikeId; }

    public String getBikeRegistrationNumber() { return bikeRegistrationNumber; }
    public void setBikeRegistrationNumber(String bikeRegistrationNumber) { this.bikeRegistrationNumber = bikeRegistrationNumber; }

    public String getBikeMakeModel() { return bikeMakeModel; }
    public void setBikeMakeModel(String bikeMakeModel) { this.bikeMakeModel = bikeMakeModel; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getPlannedEndDate() { return plannedEndDate; }
    public void setPlannedEndDate(LocalDate plannedEndDate) { this.plannedEndDate = plannedEndDate; }

    public LocalDate getActualClosedDate() { return actualClosedDate; }
    public void setActualClosedDate(LocalDate actualClosedDate) { this.actualClosedDate = actualClosedDate; }

    public BigDecimal getWeeklyRate() { return weeklyRate; }
    public void setWeeklyRate(BigDecimal weeklyRate) { this.weeklyRate = weeklyRate; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getDepositAmount() { return depositAmount; }
    public void setDepositAmount(BigDecimal depositAmount) { this.depositAmount = depositAmount; }

    public String getDepositCurrency() { return depositCurrency; }
    public void setDepositCurrency(String depositCurrency) { this.depositCurrency = depositCurrency; }

    public String getPaymentFrequency() { return paymentFrequency; }
    public void setPaymentFrequency(String paymentFrequency) { this.paymentFrequency = paymentFrequency; }

    public String getScheduleAnchorDay() { return scheduleAnchorDay; }
    public void setScheduleAnchorDay(String scheduleAnchorDay) { this.scheduleAnchorDay = scheduleAnchorDay; }

    public RentalStatus getStatus() { return status; }
    public void setStatus(RentalStatus status) { this.status = status; }

    public String getTermsAndNotes() { return termsAndNotes; }
    public void setTermsAndNotes(String termsAndNotes) { this.termsAndNotes = termsAndNotes; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

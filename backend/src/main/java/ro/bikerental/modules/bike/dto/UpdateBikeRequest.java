package ro.bikerental.modules.bike.dto;

import jakarta.validation.constraints.*;
import ro.bikerental.modules.bike.entity.BikeStatus;

import java.math.BigDecimal;
import java.time.LocalDate;

public class UpdateBikeRequest {

    @NotBlank(message = "Registration number is required")
    @Size(min = 3, max = 20, message = "Registration number must be between 3 and 20 characters")
    private String registrationNumber;

    @NotBlank(message = "VIN / Chassis number is required")
    @Size(min = 5, max = 30, message = "VIN must be between 5 and 30 characters")
    private String vin;

    @NotBlank(message = "Make is required")
    @Size(max = 50, message = "Make cannot exceed 50 characters")
    private String make;

    @NotBlank(message = "Model is required")
    @Size(max = 50, message = "Model cannot exceed 50 characters")
    private String model;

    @NotNull(message = "Manufacture year is required")
    @Min(value = 1990, message = "Manufacture year must be >= 1990")
    @Max(value = 2050, message = "Manufacture year must be <= 2050")
    private Integer manufactureYear;

    @NotNull(message = "Current odometer reading is required")
    @DecimalMin(value = "0.0", message = "Odometer reading cannot be negative")
    private BigDecimal currentOdometer;

    private LocalDate itpExpiryDate;

    private LocalDate rcaExpiryDate;

    private LocalDate cascoExpiryDate;

    @Min(value = 1, message = "Service interval must be at least 1 day")
    private Integer serviceIntervalDays;

    private BikeStatus status;

    private String notes;

    public UpdateBikeRequest() {}

    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) { this.registrationNumber = registrationNumber; }

    public String getVin() { return vin; }
    public void setVin(String vin) { this.vin = vin; }

    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public Integer getManufactureYear() { return manufactureYear; }
    public void setManufactureYear(Integer manufactureYear) { this.manufactureYear = manufactureYear; }

    public BigDecimal getCurrentOdometer() { return currentOdometer; }
    public void setCurrentOdometer(BigDecimal currentOdometer) { this.currentOdometer = currentOdometer; }

    public LocalDate getItpExpiryDate() { return itpExpiryDate; }
    public void setItpExpiryDate(LocalDate itpExpiryDate) { this.itpExpiryDate = itpExpiryDate; }

    public LocalDate getRcaExpiryDate() { return rcaExpiryDate; }
    public void setRcaExpiryDate(LocalDate rcaExpiryDate) { this.rcaExpiryDate = rcaExpiryDate; }

    public LocalDate getCascoExpiryDate() { return cascoExpiryDate; }
    public void setCascoExpiryDate(LocalDate cascoExpiryDate) { this.cascoExpiryDate = cascoExpiryDate; }

    public Integer getServiceIntervalDays() { return serviceIntervalDays; }
    public void setServiceIntervalDays(Integer serviceIntervalDays) { this.serviceIntervalDays = serviceIntervalDays; }

    public BikeStatus getStatus() { return status; }
    public void setStatus(BikeStatus status) { this.status = status; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}

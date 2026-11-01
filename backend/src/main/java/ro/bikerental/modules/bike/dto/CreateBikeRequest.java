package ro.bikerental.modules.bike.dto;

import jakarta.validation.constraints.*;
import ro.bikerental.modules.bike.entity.BikeStatus;

import java.math.BigDecimal;
import java.time.LocalDate;

public class CreateBikeRequest {

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
    private BigDecimal currentOdometer = BigDecimal.ZERO;

    private LocalDate itpExpiryDate;

    private LocalDate rcaExpiryDate;

    private LocalDate cascoExpiryDate;

    private BikeStatus status = BikeStatus.AVAILABLE;

    private String notes;

    public CreateBikeRequest() {}

    public CreateBikeRequest(String registrationNumber, String vin, String make, String model,
                             Integer manufactureYear, BigDecimal currentOdometer, LocalDate itpExpiryDate,
                             LocalDate rcaExpiryDate, LocalDate cascoExpiryDate, BikeStatus status, String notes) {
        this.registrationNumber = registrationNumber;
        this.vin = vin;
        this.make = make;
        this.model = model;
        this.manufactureYear = manufactureYear;
        this.currentOdometer = currentOdometer;
        this.itpExpiryDate = itpExpiryDate;
        this.rcaExpiryDate = rcaExpiryDate;
        this.cascoExpiryDate = cascoExpiryDate;
        this.status = status != null ? status : BikeStatus.AVAILABLE;
        this.notes = notes;
    }

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

    public BikeStatus getStatus() { return status; }
    public void setStatus(BikeStatus status) { this.status = status; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}

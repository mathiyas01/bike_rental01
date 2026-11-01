package ro.bikerental.modules.bike.dto;

import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.entity.BikeStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public class BikeDto {
    private UUID id;
    private String registrationNumber;
    private String vin;
    private String make;
    private String model;
    private int manufactureYear;
    private BigDecimal currentOdometer;
    private LocalDate itpExpiryDate;
    private LocalDate rcaExpiryDate;
    private LocalDate cascoExpiryDate;
    private BikeStatus status;
    private String notes;
    private boolean archived;
    private Instant createdAt;
    private Instant updatedAt;

    public BikeDto() {}

    public static BikeDto fromEntity(Bike bike) {
        BikeDto dto = new BikeDto();
        dto.setId(bike.getId());
        dto.setRegistrationNumber(bike.getRegistrationNumber());
        dto.setVin(bike.getVin());
        dto.setMake(bike.getMake());
        dto.setModel(bike.getModel());
        dto.setManufactureYear(bike.getManufactureYear());
        dto.setCurrentOdometer(bike.getCurrentOdometer());
        dto.setItpExpiryDate(bike.getItpExpiryDate());
        dto.setRcaExpiryDate(bike.getRcaExpiryDate());
        dto.setCascoExpiryDate(bike.getCascoExpiryDate());
        dto.setStatus(bike.getStatus());
        dto.setNotes(bike.getNotes());
        dto.setArchived(bike.isArchived());
        dto.setCreatedAt(bike.getCreatedAt());
        dto.setUpdatedAt(bike.getUpdatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) { this.registrationNumber = registrationNumber; }

    public String getVin() { return vin; }
    public void setVin(String vin) { this.vin = vin; }

    public String getMake() { return make; }
    public void setMake(String make) { this.make = make; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public int getManufactureYear() { return manufactureYear; }
    public void setManufactureYear(int manufactureYear) { this.manufactureYear = manufactureYear; }

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

    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}

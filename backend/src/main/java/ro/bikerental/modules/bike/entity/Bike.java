package ro.bikerental.modules.bike.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "bikes")
public class Bike {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "registration_number", nullable = false, unique = true, length = 20)
    private String registrationNumber;

    @Column(nullable = false, unique = true, length = 30)
    private String vin;

    @Column(nullable = false, length = 50)
    private String make;

    @Column(nullable = false, length = 50)
    private String model;

    @Column(name = "manufacture_year", nullable = false)
    private int manufactureYear;

    @Column(name = "current_odometer", nullable = false, precision = 10, scale = 1)
    private BigDecimal currentOdometer = BigDecimal.ZERO;

    @Column(name = "itp_expiry_date")
    private LocalDate itpExpiryDate;

    @Column(name = "rca_expiry_date")
    private LocalDate rcaExpiryDate;

    @Column(name = "casco_expiry_date")
    private LocalDate cascoExpiryDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BikeStatus status = BikeStatus.AVAILABLE;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "is_archived", nullable = false)
    private boolean archived = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Bike() {}

    public Bike(String registrationNumber, String vin, String make, String model, int manufactureYear,
                BigDecimal currentOdometer, LocalDate itpExpiryDate, LocalDate rcaExpiryDate,
                LocalDate cascoExpiryDate, BikeStatus status, String notes) {
        this.registrationNumber = registrationNumber != null ? registrationNumber.toUpperCase().trim() : null;
        this.vin = vin != null ? vin.toUpperCase().trim() : null;
        this.make = make != null ? make.trim() : null;
        this.model = model != null ? model.trim() : null;
        this.manufactureYear = manufactureYear;
        this.currentOdometer = currentOdometer != null ? currentOdometer : BigDecimal.ZERO;
        this.itpExpiryDate = itpExpiryDate;
        this.rcaExpiryDate = rcaExpiryDate;
        this.cascoExpiryDate = cascoExpiryDate;
        this.status = status != null ? status : BikeStatus.AVAILABLE;
        this.notes = notes;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) {
        this.registrationNumber = registrationNumber != null ? registrationNumber.toUpperCase().trim() : null;
    }

    public String getVin() { return vin; }
    public void setVin(String vin) {
        this.vin = vin != null ? vin.toUpperCase().trim() : null;
    }

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

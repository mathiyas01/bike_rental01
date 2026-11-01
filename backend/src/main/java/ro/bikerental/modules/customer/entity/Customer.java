package ro.bikerental.modules.customer.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "customers")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(nullable = false, unique = true, length = 30)
    private String phone;

    @Column(length = 150)
    private String email;

    @Column(name = "cnp_or_tax_id", length = 50)
    private String cnpOrTaxId;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(name = "living_city", length = 100)
    private String livingCity;

    @Column(name = "driving_licence_number", length = 50)
    private String drivingLicenceNumber;

    @Column(name = "licence_categories", length = 50)
    private String licenceCategories = "A,A2";

    @Column(name = "licence_expiry_date")
    private LocalDate licenceExpiryDate;

    @Column(columnDefinition = "TEXT")
    private String address;

    @Column(name = "gdpr_consent_date")
    private LocalDate gdprConsentDate;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "is_archived", nullable = false)
    private boolean archived = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Customer() {}

    public Customer(String fullName, String phone, String email, String cnpOrTaxId,
                    String drivingLicenceNumber, String licenceCategories, LocalDate licenceExpiryDate,
                    String address, LocalDate gdprConsentDate, String notes) {
        this.fullName = fullName;
        this.phone = phone;
        this.email = email;
        this.cnpOrTaxId = cnpOrTaxId;
        this.drivingLicenceNumber = drivingLicenceNumber;
        this.licenceCategories = licenceCategories != null ? licenceCategories : "A,A2";
        this.licenceExpiryDate = licenceExpiryDate;
        this.address = address;
        this.gdprConsentDate = gdprConsentDate != null ? gdprConsentDate : LocalDate.now();
        this.notes = notes;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getCnpOrTaxId() { return cnpOrTaxId; }
    public void setCnpOrTaxId(String cnpOrTaxId) { this.cnpOrTaxId = cnpOrTaxId; }

    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate dateOfBirth) { this.dateOfBirth = dateOfBirth; }

    public String getLivingCity() { return livingCity; }
    public void setLivingCity(String livingCity) { this.livingCity = livingCity; }

    public String getDrivingLicenceNumber() { return drivingLicenceNumber; }
    public void setDrivingLicenceNumber(String drivingLicenceNumber) { this.drivingLicenceNumber = drivingLicenceNumber; }

    public String getLicenceCategories() { return licenceCategories; }
    public void setLicenceCategories(String licenceCategories) { this.licenceCategories = licenceCategories; }

    public LocalDate getLicenceExpiryDate() { return licenceExpiryDate; }
    public void setLicenceExpiryDate(LocalDate licenceExpiryDate) { this.licenceExpiryDate = licenceExpiryDate; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public LocalDate getGdprConsentDate() { return gdprConsentDate; }
    public void setGdprConsentDate(LocalDate gdprConsentDate) { this.gdprConsentDate = gdprConsentDate; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}

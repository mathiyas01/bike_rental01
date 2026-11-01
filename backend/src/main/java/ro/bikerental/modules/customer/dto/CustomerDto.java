package ro.bikerental.modules.customer.dto;

import ro.bikerental.modules.customer.entity.Customer;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public class CustomerDto {
    private UUID id;
    private String fullName;
    private String phone;
    private String email;
    private String cnpOrTaxId;
    private LocalDate dateOfBirth;
    private String livingCity;
    private String drivingLicenceNumber;
    private String licenceCategories;
    private LocalDate licenceExpiryDate;
    private String address;
    private LocalDate gdprConsentDate;
    private String notes;
    private boolean archived;
    private Instant createdAt;
    private Instant updatedAt;

    public CustomerDto() {}

    public static CustomerDto fromEntity(Customer customer) {
        CustomerDto dto = new CustomerDto();
        dto.setId(customer.getId());
        dto.setFullName(customer.getFullName());
        dto.setPhone(customer.getPhone());
        dto.setEmail(customer.getEmail());
        dto.setCnpOrTaxId(customer.getCnpOrTaxId());
        dto.setDateOfBirth(customer.getDateOfBirth());
        dto.setLivingCity(customer.getLivingCity());
        dto.setDrivingLicenceNumber(customer.getDrivingLicenceNumber());
        dto.setLicenceCategories(customer.getLicenceCategories());
        dto.setLicenceExpiryDate(customer.getLicenceExpiryDate());
        dto.setAddress(customer.getAddress());
        dto.setGdprConsentDate(customer.getGdprConsentDate());
        dto.setNotes(customer.getNotes());
        dto.setArchived(customer.isArchived());
        dto.setCreatedAt(customer.getCreatedAt());
        dto.setUpdatedAt(customer.getUpdatedAt());
        return dto;
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

package ro.bikerental.modules.customer.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public class CreateCustomerRequest {

    @NotBlank(message = "Customer full name is required")
    @Size(max = 150, message = "Full name cannot exceed 150 characters")
    private String fullName;

    @NotBlank(message = "Phone number is required")
    @Size(min = 8, max = 30, message = "Phone number must be between 8 and 30 characters")
    private String phone;

    @Email(message = "Email must be valid")
    private String email;

    @Size(max = 50, message = "CNP or Tax ID cannot exceed 50 characters")
    private String cnpOrTaxId;

    private LocalDate dateOfBirth;

    private String livingCity;

    @Size(max = 50, message = "Driving licence number cannot exceed 50 characters")
    private String drivingLicenceNumber;

    private String licenceCategories = "A,A2";

    private LocalDate licenceExpiryDate;

    private String address;

    private LocalDate gdprConsentDate = LocalDate.now();

    private String notes;

    public CreateCustomerRequest() {}

    public CreateCustomerRequest(String fullName, String phone, String email, String cnpOrTaxId,
                                 String drivingLicenceNumber, String licenceCategories, LocalDate licenceExpiryDate,
                                 String address, String notes) {
        this.fullName = fullName;
        this.phone = phone;
        this.email = email;
        this.cnpOrTaxId = cnpOrTaxId;
        this.drivingLicenceNumber = drivingLicenceNumber;
        this.licenceCategories = licenceCategories;
        this.licenceExpiryDate = licenceExpiryDate;
        this.address = address;
        this.notes = notes;
    }

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
}

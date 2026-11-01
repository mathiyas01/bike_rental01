package ro.bikerental.modules.customer.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public class UpdateCustomerRequest {

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

    @Size(max = 50, message = "Driving licence number cannot exceed 50 characters")
    private String drivingLicenceNumber;

    private String licenceCategories;

    private LocalDate licenceExpiryDate;

    private String address;

    private String notes;

    public UpdateCustomerRequest() {}

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getCnpOrTaxId() { return cnpOrTaxId; }
    public void setCnpOrTaxId(String cnpOrTaxId) { this.cnpOrTaxId = cnpOrTaxId; }

    public String getDrivingLicenceNumber() { return drivingLicenceNumber; }
    public void setDrivingLicenceNumber(String drivingLicenceNumber) { this.drivingLicenceNumber = drivingLicenceNumber; }

    public String getLicenceCategories() { return licenceCategories; }
    public void setLicenceCategories(String licenceCategories) { this.licenceCategories = licenceCategories; }

    public LocalDate getLicenceExpiryDate() { return licenceExpiryDate; }
    public void setLicenceExpiryDate(LocalDate licenceExpiryDate) { this.licenceExpiryDate = licenceExpiryDate; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}

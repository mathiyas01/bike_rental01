package ro.bikerental.modules.inventory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateSupplierRequest {

    @NotBlank(message = "Supplier name is required")
    @Size(max = 150, message = "Supplier name must not exceed 150 characters")
    private String name;

    @Size(max = 100, message = "Contact person must not exceed 100 characters")
    private String contactPerson;

    @Size(max = 30, message = "Phone must not exceed 30 characters")
    private String phone;

    @Size(max = 150, message = "Email must not exceed 150 characters")
    private String email;

    @Size(max = 50, message = "Tax CUI must not exceed 50 characters")
    private String taxCui;

    private String address;
    private String notes;

    public CreateSupplierRequest() {}

    public CreateSupplierRequest(String name, String contactPerson, String phone, String email,
                                 String taxCui, String address, String notes) {
        this.name = name;
        this.contactPerson = contactPerson;
        this.phone = phone;
        this.email = email;
        this.taxCui = taxCui;
        this.address = address;
        this.notes = notes;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getContactPerson() { return contactPerson; }
    public void setContactPerson(String contactPerson) { this.contactPerson = contactPerson; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getTaxCui() { return taxCui; }
    public void setTaxCui(String taxCui) { this.taxCui = taxCui; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}


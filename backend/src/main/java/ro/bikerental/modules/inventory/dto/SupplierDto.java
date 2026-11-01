package ro.bikerental.modules.inventory.dto;

import ro.bikerental.modules.inventory.entity.Supplier;

import java.time.Instant;
import java.util.UUID;

public class SupplierDto {

    private UUID id;
    private String name;
    private String contactPerson;
    private String phone;
    private String email;
    private String taxCui;
    private String address;
    private String notes;
    private boolean active;
    private Instant createdAt;

    public SupplierDto() {}

    public static SupplierDto fromEntity(Supplier supplier) {
        SupplierDto dto = new SupplierDto();
        dto.setId(supplier.getId());
        dto.setName(supplier.getName());
        dto.setContactPerson(supplier.getContactPerson());
        dto.setPhone(supplier.getPhone());
        dto.setEmail(supplier.getEmail());
        dto.setTaxCui(supplier.getTaxCui());
        dto.setAddress(supplier.getAddress());
        dto.setNotes(supplier.getNotes());
        dto.setActive(supplier.isActive());
        dto.setCreatedAt(supplier.getCreatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

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

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


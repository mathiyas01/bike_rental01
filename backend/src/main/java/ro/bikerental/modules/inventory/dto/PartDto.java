package ro.bikerental.modules.inventory.dto;

import ro.bikerental.modules.inventory.entity.Part;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public class PartDto {

    private UUID id;
    private String partCode;
    private String name;
    private String category;
    private String description;
    private String unitOfMeasure;
    private BigDecimal currentQuantity;
    private BigDecimal minReorderLevel;
    private BigDecimal defaultUnitCost;
    private String costCurrency;
    private UUID defaultSupplierId;
    private String defaultSupplierName;
    private boolean isLowStock;
    private boolean active;
    private Instant createdAt;

    public PartDto() {}

    public static PartDto fromEntity(Part part) {
        PartDto dto = new PartDto();
        dto.setId(part.getId());
        dto.setPartCode(part.getPartCode());
        dto.setName(part.getName());
        dto.setCategory(part.getCategory());
        dto.setDescription(part.getDescription());
        dto.setUnitOfMeasure(part.getUnitOfMeasure());
        dto.setCurrentQuantity(part.getCurrentQuantity());
        dto.setMinReorderLevel(part.getMinReorderLevel());
        dto.setDefaultUnitCost(part.getDefaultUnitCost());
        dto.setCostCurrency(part.getCostCurrency());
        if (part.getDefaultSupplier() != null) {
            dto.setDefaultSupplierId(part.getDefaultSupplier().getId());
            dto.setDefaultSupplierName(part.getDefaultSupplier().getName());
        }
        dto.setLowStock(part.getCurrentQuantity().compareTo(part.getMinReorderLevel()) <= 0);
        dto.setActive(part.isActive());
        dto.setCreatedAt(part.getCreatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getPartCode() { return partCode; }
    public void setPartCode(String partCode) { this.partCode = partCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getUnitOfMeasure() { return unitOfMeasure; }
    public void setUnitOfMeasure(String unitOfMeasure) { this.unitOfMeasure = unitOfMeasure; }

    public BigDecimal getCurrentQuantity() { return currentQuantity; }
    public void setCurrentQuantity(BigDecimal currentQuantity) { this.currentQuantity = currentQuantity; }

    public BigDecimal getMinReorderLevel() { return minReorderLevel; }
    public void setMinReorderLevel(BigDecimal minReorderLevel) { this.minReorderLevel = minReorderLevel; }

    public BigDecimal getDefaultUnitCost() { return defaultUnitCost; }
    public void setDefaultUnitCost(BigDecimal defaultUnitCost) { this.defaultUnitCost = defaultUnitCost; }

    public String getCostCurrency() { return costCurrency; }
    public void setCostCurrency(String costCurrency) { this.costCurrency = costCurrency; }

    public UUID getDefaultSupplierId() { return defaultSupplierId; }
    public void setDefaultSupplierId(UUID defaultSupplierId) { this.defaultSupplierId = defaultSupplierId; }

    public String getDefaultSupplierName() { return defaultSupplierName; }
    public void setDefaultSupplierName(String defaultSupplierName) { this.defaultSupplierName = defaultSupplierName; }

    public boolean isLowStock() { return isLowStock; }
    public void setLowStock(boolean lowStock) { isLowStock = lowStock; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


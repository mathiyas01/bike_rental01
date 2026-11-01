package ro.bikerental.modules.inventory.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;

public class UpdatePartRequest {

    @NotBlank(message = "Part name is required")
    @Size(max = 150, message = "Part name must not exceed 150 characters")
    private String name;

    @NotBlank(message = "Category is required")
    @Size(max = 50, message = "Category must not exceed 50 characters")
    private String category;

    private String description;

    @NotBlank(message = "Unit of measure is required")
    @Size(max = 20, message = "Unit of measure must not exceed 20 characters")
    private String unitOfMeasure;

    @NotNull(message = "Minimum reorder level is required")
    @DecimalMin(value = "0.0", message = "Minimum reorder level cannot be negative")
    private BigDecimal minReorderLevel;

    @NotNull(message = "Default unit cost is required")
    @DecimalMin(value = "0.0", message = "Default unit cost cannot be negative")
    private BigDecimal defaultUnitCost;

    private UUID defaultSupplierId;

    public UpdatePartRequest() {}

    public UpdatePartRequest(String name, String category, String description,
                             String unitOfMeasure, BigDecimal minReorderLevel,
                             BigDecimal defaultUnitCost, UUID defaultSupplierId) {
        this.name = name;
        this.category = category;
        this.description = description;
        this.unitOfMeasure = unitOfMeasure;
        this.minReorderLevel = minReorderLevel;
        this.defaultUnitCost = defaultUnitCost;
        this.defaultSupplierId = defaultSupplierId;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getUnitOfMeasure() { return unitOfMeasure; }
    public void setUnitOfMeasure(String unitOfMeasure) { this.unitOfMeasure = unitOfMeasure; }

    public BigDecimal getMinReorderLevel() { return minReorderLevel; }
    public void setMinReorderLevel(BigDecimal minReorderLevel) { this.minReorderLevel = minReorderLevel; }

    public BigDecimal getDefaultUnitCost() { return defaultUnitCost; }
    public void setDefaultUnitCost(BigDecimal defaultUnitCost) { this.defaultUnitCost = defaultUnitCost; }

    public UUID getDefaultSupplierId() { return defaultSupplierId; }
    public void setDefaultSupplierId(UUID defaultSupplierId) { this.defaultSupplierId = defaultSupplierId; }
}


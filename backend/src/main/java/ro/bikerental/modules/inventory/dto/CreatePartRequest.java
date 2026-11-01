package ro.bikerental.modules.inventory.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.UUID;

public class CreatePartRequest {

    @NotBlank(message = "Part code is required")
    @Size(max = 50, message = "Part code must not exceed 50 characters")
    private String partCode;

    @NotBlank(message = "Part name is required")
    @Size(max = 150, message = "Part name must not exceed 150 characters")
    private String name;

    @NotBlank(message = "Category is required")
    @Size(max = 50, message = "Category must not exceed 50 characters")
    private String category;

    private String description;

    @NotBlank(message = "Unit of measure is required")
    @Size(max = 20, message = "Unit of measure must not exceed 20 characters")
    private String unitOfMeasure = "PCS";

    @NotNull(message = "Initial quantity is required")
    @DecimalMin(value = "0.0", message = "Initial quantity cannot be negative")
    private BigDecimal initialQuantity = BigDecimal.ZERO;

    @NotNull(message = "Minimum reorder level is required")
    @DecimalMin(value = "0.0", message = "Minimum reorder level cannot be negative")
    private BigDecimal minReorderLevel = BigDecimal.valueOf(2.0);

    @NotNull(message = "Default unit cost is required")
    @DecimalMin(value = "0.0", message = "Default unit cost cannot be negative")
    private BigDecimal defaultUnitCost = BigDecimal.ZERO;

    @NotBlank(message = "Cost currency is required")
    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Currency must be one of: RON, EUR, USD")
    private String costCurrency = "RON";

    private UUID defaultSupplierId;

    public CreatePartRequest() {}

    public CreatePartRequest(String partCode, String name, String category, String description,
                             String unitOfMeasure, BigDecimal initialQuantity, BigDecimal minReorderLevel,
                             BigDecimal defaultUnitCost, String costCurrency, UUID defaultSupplierId) {
        this.partCode = partCode;
        this.name = name;
        this.category = category;
        this.description = description;
        this.unitOfMeasure = unitOfMeasure != null ? unitOfMeasure : "PCS";
        this.initialQuantity = initialQuantity != null ? initialQuantity : BigDecimal.ZERO;
        this.minReorderLevel = minReorderLevel != null ? minReorderLevel : BigDecimal.valueOf(2.0);
        this.defaultUnitCost = defaultUnitCost != null ? defaultUnitCost : BigDecimal.ZERO;
        this.costCurrency = costCurrency != null ? costCurrency : "RON";
        this.defaultSupplierId = defaultSupplierId;
    }

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

    public BigDecimal getInitialQuantity() { return initialQuantity; }
    public void setInitialQuantity(BigDecimal initialQuantity) { this.initialQuantity = initialQuantity; }

    public BigDecimal getMinReorderLevel() { return minReorderLevel; }
    public void setMinReorderLevel(BigDecimal minReorderLevel) { this.minReorderLevel = minReorderLevel; }

    public BigDecimal getDefaultUnitCost() { return defaultUnitCost; }
    public void setDefaultUnitCost(BigDecimal defaultUnitCost) { this.defaultUnitCost = defaultUnitCost; }

    public String getCostCurrency() { return costCurrency; }
    public void setCostCurrency(String costCurrency) { this.costCurrency = costCurrency; }

    public UUID getDefaultSupplierId() { return defaultSupplierId; }
    public void setDefaultSupplierId(UUID defaultSupplierId) { this.defaultSupplierId = defaultSupplierId; }
}


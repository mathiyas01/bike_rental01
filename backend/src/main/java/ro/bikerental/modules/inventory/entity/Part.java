package ro.bikerental.modules.inventory.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "parts")
public class Part {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "part_code", nullable = false, unique = true, length = 50)
    private String partCode;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(nullable = false, length = 50)
    private String category;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "unit_of_measure", nullable = false, length = 20)
    private String unitOfMeasure = "PCS";

    @Column(name = "current_quantity", nullable = false, precision = 10, scale = 2)
    private BigDecimal currentQuantity = BigDecimal.ZERO;

    @Column(name = "min_reorder_level", nullable = false, precision = 10, scale = 2)
    private BigDecimal minReorderLevel = BigDecimal.valueOf(2.0);

    @Column(name = "default_unit_cost", nullable = false, precision = 14, scale = 2)
    private BigDecimal defaultUnitCost = BigDecimal.ZERO;

    @Column(name = "cost_currency", nullable = false, length = 3)
    private String costCurrency = "RON";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "default_supplier_id")
    private Supplier defaultSupplier;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Part() {}

    public Part(String partCode, String name, String category, String description,
                String unitOfMeasure, BigDecimal currentQuantity, BigDecimal minReorderLevel,
                BigDecimal defaultUnitCost, String costCurrency, Supplier defaultSupplier) {
        this.partCode = partCode != null ? partCode.toUpperCase().trim() : null;
        this.name = name;
        this.category = category != null ? category.toUpperCase().trim() : null;
        this.description = description;
        this.unitOfMeasure = unitOfMeasure != null ? unitOfMeasure.toUpperCase().trim() : "PCS";
        this.currentQuantity = currentQuantity != null ? currentQuantity : BigDecimal.ZERO;
        this.minReorderLevel = minReorderLevel != null ? minReorderLevel : BigDecimal.valueOf(2.0);
        this.defaultUnitCost = defaultUnitCost != null ? defaultUnitCost : BigDecimal.ZERO;
        this.costCurrency = costCurrency != null ? costCurrency.toUpperCase().trim() : "RON";
        this.defaultSupplier = defaultSupplier;
        this.active = true;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getPartCode() { return partCode; }
    public void setPartCode(String partCode) { this.partCode = partCode != null ? partCode.toUpperCase().trim() : null; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category != null ? category.toUpperCase().trim() : null; }

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
    public void setCostCurrency(String costCurrency) { this.costCurrency = costCurrency != null ? costCurrency.toUpperCase().trim() : "RON"; }

    public Supplier getDefaultSupplier() { return defaultSupplier; }
    public void setDefaultSupplier(Supplier defaultSupplier) { this.defaultSupplier = defaultSupplier; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}


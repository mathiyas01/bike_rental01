package ro.bikerental.modules.servicing.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public class LogServicePartItem {

    @NotNull(message = "Part ID is required")
    private UUID partId;

    @NotNull(message = "Quantity is required")
    @DecimalMin(value = "0.01", message = "Quantity must be greater than 0")
    private BigDecimal quantity;

    @DecimalMin(value = "0.0", message = "Unit cost cannot be negative")
    private BigDecimal unitCost;

    private String currency = "RON";

    public LogServicePartItem() {}

    public LogServicePartItem(UUID partId, BigDecimal quantity, BigDecimal unitCost, String currency) {
        this.partId = partId;
        this.quantity = quantity;
        this.unitCost = unitCost;
        this.currency = currency != null ? currency : "RON";
    }

    public UUID getPartId() { return partId; }
    public void setPartId(UUID partId) { this.partId = partId; }

    public BigDecimal getQuantity() { return quantity; }
    public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
}


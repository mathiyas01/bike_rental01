package ro.bikerental.modules.inventory.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import ro.bikerental.modules.inventory.entity.StockMovementType;

import java.math.BigDecimal;
import java.util.UUID;

public class RecordStockMovementRequest {

    @NotNull(message = "Part ID is required")
    private UUID partId;

    @NotNull(message = "Quantity delta is required")
    @DecimalMin(value = "0.01", message = "Quantity delta must be greater than 0")
    private BigDecimal quantity;

    @NotNull(message = "Movement type is required")
    private StockMovementType movementType;

    private String referenceType;
    private UUID referenceId;
    private BigDecimal unitCost;

    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Currency must be one of: RON, EUR, USD")
    private String currency = "RON";

    private String reason;

    public RecordStockMovementRequest() {}

    public RecordStockMovementRequest(UUID partId, BigDecimal quantity, StockMovementType movementType,
                                      String referenceType, UUID referenceId, BigDecimal unitCost,
                                      String currency, String reason) {
        this.partId = partId;
        this.quantity = quantity;
        this.movementType = movementType;
        this.referenceType = referenceType;
        this.referenceId = referenceId;
        this.unitCost = unitCost;
        this.currency = currency != null ? currency : "RON";
        this.reason = reason;
    }

    public UUID getPartId() { return partId; }
    public void setPartId(UUID partId) { this.partId = partId; }

    public BigDecimal getQuantity() { return quantity; }
    public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }

    public StockMovementType getMovementType() { return movementType; }
    public void setMovementType(StockMovementType movementType) { this.movementType = movementType; }

    public String getReferenceType() { return referenceType; }
    public void setReferenceType(String referenceType) { this.referenceType = referenceType; }

    public UUID getReferenceId() { return referenceId; }
    public void setReferenceId(UUID referenceId) { this.referenceId = referenceId; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}


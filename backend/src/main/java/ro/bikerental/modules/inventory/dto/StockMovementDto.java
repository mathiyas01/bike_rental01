package ro.bikerental.modules.inventory.dto;

import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public class StockMovementDto {

    private UUID id;
    private UUID partId;
    private String partCode;
    private String partName;
    private BigDecimal quantityDelta;
    private StockMovementType movementType;
    private String referenceType;
    private UUID referenceId;
    private BigDecimal unitCost;
    private String currency;
    private String reason;
    private String recordedByUserName;
    private Instant createdAt;

    public StockMovementDto() {}

    public static StockMovementDto fromEntity(StockMovement movement) {
        StockMovementDto dto = new StockMovementDto();
        dto.setId(movement.getId());
        dto.setPartId(movement.getPart().getId());
        dto.setPartCode(movement.getPart().getPartCode());
        dto.setPartName(movement.getPart().getName());
        dto.setQuantityDelta(movement.getQuantityDelta());
        dto.setMovementType(movement.getMovementType());
        dto.setReferenceType(movement.getReferenceType());
        dto.setReferenceId(movement.getReferenceId());
        dto.setUnitCost(movement.getUnitCost());
        dto.setCurrency(movement.getCurrency());
        dto.setReason(movement.getReason());
        if (movement.getRecordedByUser() != null) {
            dto.setRecordedByUserName(movement.getRecordedByUser().getFullName());
        }
        dto.setCreatedAt(movement.getCreatedAt());
        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getPartId() { return partId; }
    public void setPartId(UUID partId) { this.partId = partId; }

    public String getPartCode() { return partCode; }
    public void setPartCode(String partCode) { this.partCode = partCode; }

    public String getPartName() { return partName; }
    public void setPartName(String partName) { this.partName = partName; }

    public BigDecimal getQuantityDelta() { return quantityDelta; }
    public void setQuantityDelta(BigDecimal quantityDelta) { this.quantityDelta = quantityDelta; }

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

    public String getRecordedByUserName() { return recordedByUserName; }
    public void setRecordedByUserName(String recordedByUserName) { this.recordedByUserName = recordedByUserName; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


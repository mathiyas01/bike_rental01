package ro.bikerental.modules.servicing.dto;

import ro.bikerental.modules.servicing.entity.ServicePartUsage;

import java.math.BigDecimal;
import java.util.UUID;

public class ServicePartUsageDto {

    private UUID id;
    private UUID partId;
    private String partCode;
    private String partName;
    private BigDecimal quantity;
    private BigDecimal unitCost;
    private String currency;
    private BigDecimal totalCost;

    public ServicePartUsageDto() {}

    public static ServicePartUsageDto fromEntity(ServicePartUsage usage) {
        ServicePartUsageDto dto = new ServicePartUsageDto();
        dto.setId(usage.getId());
        dto.setPartId(usage.getPart().getId());
        dto.setPartCode(usage.getPart().getPartCode());
        dto.setPartName(usage.getPart().getName());
        dto.setQuantity(usage.getQuantity());
        dto.setUnitCost(usage.getUnitCost());
        dto.setCurrency(usage.getCurrency());
        dto.setTotalCost(usage.getQuantity().multiply(usage.getUnitCost()));
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

    public BigDecimal getQuantity() { return quantity; }
    public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getTotalCost() { return totalCost; }
    public void setTotalCost(BigDecimal totalCost) { this.totalCost = totalCost; }
}


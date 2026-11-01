package ro.bikerental.modules.payment.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public class ManualAllocationItem {

    @NotNull(message = "Rental charge ID is required")
    private UUID rentalChargeId;

    @NotNull(message = "Allocated amount is required")
    @DecimalMin(value = "0.01", message = "Allocated amount must be greater than 0")
    private BigDecimal amount;

    public ManualAllocationItem() {}

    public ManualAllocationItem(UUID rentalChargeId, BigDecimal amount) {
        this.rentalChargeId = rentalChargeId;
        this.amount = amount;
    }

    public UUID getRentalChargeId() { return rentalChargeId; }
    public void setRentalChargeId(UUID rentalChargeId) { this.rentalChargeId = rentalChargeId; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public BigDecimal getAllocatedAmount() { return amount; }
    public void setAllocatedAmount(BigDecimal allocatedAmount) { this.amount = allocatedAmount; }
}

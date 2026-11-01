package ro.bikerental.modules.inventory.entity;

import jakarta.persistence.*;
import ro.bikerental.modules.auth.entity.AppUser;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "stock_movements")
public class StockMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "part_id", nullable = false)
    private Part part;

    @Column(name = "quantity_delta", nullable = false, precision = 10, scale = 2)
    private BigDecimal quantityDelta;

    @Enumerated(EnumType.STRING)
    @Column(name = "movement_type", nullable = false, length = 30)
    private StockMovementType movementType;

    @Column(name = "reference_type", length = 50)
    private String referenceType;

    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(name = "unit_cost", precision = 14, scale = 2)
    private BigDecimal unitCost = BigDecimal.ZERO;

    @Column(length = 3)
    private String currency = "RON";

    @Column(columnDefinition = "TEXT")
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recorded_by_user_id", nullable = false)
    private AppUser recordedByUser;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public StockMovement() {}

    public StockMovement(Part part, BigDecimal quantityDelta, StockMovementType movementType,
                         String referenceType, UUID referenceId, BigDecimal unitCost,
                         String currency, String reason, AppUser recordedByUser) {
        this.part = part;
        this.quantityDelta = quantityDelta;
        this.movementType = movementType;
        this.referenceType = referenceType;
        this.referenceId = referenceId;
        this.unitCost = unitCost != null ? unitCost : BigDecimal.ZERO;
        this.currency = currency != null ? currency.toUpperCase().trim() : "RON";
        this.reason = reason;
        this.recordedByUser = recordedByUser;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Part getPart() { return part; }
    public void setPart(Part part) { this.part = part; }

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

    public AppUser getRecordedByUser() { return recordedByUser; }
    public void setRecordedByUser(AppUser recordedByUser) { this.recordedByUser = recordedByUser; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


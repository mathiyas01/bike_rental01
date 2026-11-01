package ro.bikerental.modules.servicing.entity;

import jakarta.persistence.*;
import ro.bikerental.modules.inventory.entity.Part;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "service_part_usage")
public class ServicePartUsage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_record_id", nullable = false)
    private ServiceRecord serviceRecord;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "part_id", nullable = false)
    private Part part;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_cost", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitCost = BigDecimal.ZERO;

    @Column(nullable = false, length = 3)
    private String currency = "RON";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public ServicePartUsage() {}

    public ServicePartUsage(ServiceRecord serviceRecord, Part part, BigDecimal quantity,
                            BigDecimal unitCost, String currency) {
        this.serviceRecord = serviceRecord;
        this.part = part;
        this.quantity = quantity;
        this.unitCost = unitCost != null ? unitCost : BigDecimal.ZERO;
        this.currency = currency != null ? currency.toUpperCase().trim() : "RON";
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public ServiceRecord getServiceRecord() { return serviceRecord; }
    public void setServiceRecord(ServiceRecord serviceRecord) { this.serviceRecord = serviceRecord; }

    public Part getPart() { return part; }
    public void setPart(Part part) { this.part = part; }

    public BigDecimal getQuantity() { return quantity; }
    public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }

    public BigDecimal getUnitCost() { return unitCost; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


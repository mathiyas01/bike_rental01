package ro.bikerental.modules.servicing.entity;

import jakarta.persistence.*;
import ro.bikerental.modules.bike.entity.Bike;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "service_records")
public class ServiceRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bike_id", nullable = false)
    private Bike bike;

    @Column(name = "service_date", nullable = false)
    private LocalDate serviceDate;

    @Column(name = "odometer_reading", nullable = false, precision = 10, scale = 1)
    private BigDecimal odometerReading;

    @Column(name = "service_provider", nullable = false, length = 150)
    private String serviceProvider;

    @Column(name = "work_performed", nullable = false, columnDefinition = "TEXT")
    private String workPerformed;

    @Column(name = "labour_cost", nullable = false, precision = 14, scale = 2)
    private BigDecimal labourCost = BigDecimal.ZERO;

    @Column(name = "labour_currency", nullable = false, length = 3)
    private String labourCurrency = "RON";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ServiceStatus status = ServiceStatus.PLANNED;

    @Column(name = "next_service_due_date")
    private LocalDate nextServiceDueDate;

    @Column(name = "next_service_due_odometer", precision = 10, scale = 1)
    private BigDecimal nextServiceDueOdometer;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @OneToMany(mappedBy = "serviceRecord", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ServicePartUsage> partUsages = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public ServiceRecord() {}

    public ServiceRecord(Bike bike, LocalDate serviceDate, BigDecimal odometerReading,
                         String serviceProvider, String workPerformed, BigDecimal labourCost,
                         String labourCurrency, ServiceStatus status, LocalDate nextServiceDueDate,
                         BigDecimal nextServiceDueOdometer, String notes) {
        this.bike = bike;
        this.serviceDate = serviceDate;
        this.odometerReading = odometerReading;
        this.serviceProvider = serviceProvider;
        this.workPerformed = workPerformed;
        this.labourCost = labourCost != null ? labourCost : BigDecimal.ZERO;
        this.labourCurrency = labourCurrency != null ? labourCurrency.toUpperCase().trim() : "RON";
        this.status = status != null ? status : ServiceStatus.PLANNED;
        this.nextServiceDueDate = nextServiceDueDate;
        this.nextServiceDueOdometer = nextServiceDueOdometer;
        this.notes = notes;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Bike getBike() { return bike; }
    public void setBike(Bike bike) { this.bike = bike; }

    public LocalDate getServiceDate() { return serviceDate; }
    public void setServiceDate(LocalDate serviceDate) { this.serviceDate = serviceDate; }

    public BigDecimal getOdometerReading() { return odometerReading; }
    public void setOdometerReading(BigDecimal odometerReading) { this.odometerReading = odometerReading; }

    public String getServiceProvider() { return serviceProvider; }
    public void setServiceProvider(String serviceProvider) { this.serviceProvider = serviceProvider; }

    public String getWorkPerformed() { return workPerformed; }
    public void setWorkPerformed(String workPerformed) { this.workPerformed = workPerformed; }

    public BigDecimal getLabourCost() { return labourCost; }
    public void setLabourCost(BigDecimal labourCost) { this.labourCost = labourCost; }

    public String getLabourCurrency() { return labourCurrency; }
    public void setLabourCurrency(String labourCurrency) { this.labourCurrency = labourCurrency != null ? labourCurrency.toUpperCase().trim() : "RON"; }

    public ServiceStatus getStatus() { return status; }
    public void setStatus(ServiceStatus status) { this.status = status; }

    public LocalDate getNextServiceDueDate() { return nextServiceDueDate; }
    public void setNextServiceDueDate(LocalDate nextServiceDueDate) { this.nextServiceDueDate = nextServiceDueDate; }

    public BigDecimal getNextServiceDueOdometer() { return nextServiceDueOdometer; }
    public void setNextServiceDueOdometer(BigDecimal nextServiceDueOdometer) { this.nextServiceDueOdometer = nextServiceDueOdometer; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public List<ServicePartUsage> getPartUsages() { return partUsages; }
    public void setPartUsages(List<ServicePartUsage> partUsages) { this.partUsages = partUsages; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}


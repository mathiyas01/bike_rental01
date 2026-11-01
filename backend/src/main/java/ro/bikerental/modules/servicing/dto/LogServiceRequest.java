package ro.bikerental.modules.servicing.dto;

import jakarta.validation.constraints.*;
import ro.bikerental.modules.servicing.entity.ServiceStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class LogServiceRequest {

    @NotNull(message = "Motorbike ID is required")
    private UUID motorbikeId;

    @NotNull(message = "Service date is required")
    private LocalDate serviceDate;

    @NotNull(message = "Odometer reading is required")
    @DecimalMin(value = "0.0", message = "Odometer reading cannot be negative")
    private BigDecimal odometerReading;

    @NotBlank(message = "Service provider is required")
    @Size(max = 150, message = "Service provider must not exceed 150 characters")
    private String serviceProvider;

    @NotBlank(message = "Work performed description is required")
    private String workPerformed;

    @NotNull(message = "Labour cost is required")
    @DecimalMin(value = "0.0", message = "Labour cost cannot be negative")
    private BigDecimal labourCost = BigDecimal.ZERO;

    @NotBlank(message = "Labour currency is required")
    @Pattern(regexp = "^(RON|EUR|USD)$", message = "Currency must be one of: RON, EUR, USD")
    private String labourCurrency = "RON";

    private ServiceStatus status = ServiceStatus.COMPLETED;

    private LocalDate nextServiceDueDate;
    private BigDecimal nextServiceDueOdometer;
    private String notes;

    private List<LogServicePartItem> partsUsed = new ArrayList<>();

    public LogServiceRequest() {}

    public LogServiceRequest(UUID motorbikeId, LocalDate serviceDate, BigDecimal odometerReading,
                             String serviceProvider, String workPerformed, BigDecimal labourCost,
                             String labourCurrency, ServiceStatus status, LocalDate nextServiceDueDate,
                             BigDecimal nextServiceDueOdometer, String notes, List<LogServicePartItem> partsUsed) {
        this.motorbikeId = motorbikeId;
        this.serviceDate = serviceDate;
        this.odometerReading = odometerReading;
        this.serviceProvider = serviceProvider;
        this.workPerformed = workPerformed;
        this.labourCost = labourCost != null ? labourCost : BigDecimal.ZERO;
        this.labourCurrency = labourCurrency != null ? labourCurrency : "RON";
        this.status = status != null ? status : ServiceStatus.COMPLETED;
        this.nextServiceDueDate = nextServiceDueDate;
        this.nextServiceDueOdometer = nextServiceDueOdometer;
        this.notes = notes;
        this.partsUsed = partsUsed != null ? partsUsed : new ArrayList<>();
    }

    public UUID getMotorbikeId() { return motorbikeId; }
    public void setMotorbikeId(UUID motorbikeId) { this.motorbikeId = motorbikeId; }

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
    public void setLabourCurrency(String labourCurrency) { this.labourCurrency = labourCurrency; }

    public ServiceStatus getStatus() { return status; }
    public void setStatus(ServiceStatus status) { this.status = status; }

    public LocalDate getNextServiceDueDate() { return nextServiceDueDate; }
    public void setNextServiceDueDate(LocalDate nextServiceDueDate) { this.nextServiceDueDate = nextServiceDueDate; }

    public BigDecimal getNextServiceDueOdometer() { return nextServiceDueOdometer; }
    public void setNextServiceDueOdometer(BigDecimal nextServiceDueOdometer) { this.nextServiceDueOdometer = nextServiceDueOdometer; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public List<LogServicePartItem> getPartsUsed() { return partsUsed; }
    public void setPartsUsed(List<LogServicePartItem> partsUsed) { this.partsUsed = partsUsed; }
}


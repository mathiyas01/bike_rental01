package ro.bikerental.modules.servicing.dto;

import ro.bikerental.modules.servicing.entity.ServiceRecord;
import ro.bikerental.modules.servicing.entity.ServiceStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

public class ServiceRecordDto {

    private UUID id;
    private UUID bikeId;
    private String bikeRegistrationNumber;
    private String bikeMakeModel;
    private LocalDate serviceDate;
    private BigDecimal odometerReading;
    private String serviceProvider;
    private String workPerformed;
    private BigDecimal labourCost;
    private String labourCurrency;
    private BigDecimal partsCost;
    private BigDecimal totalCost;
    private ServiceStatus status;
    private LocalDate nextServiceDueDate;
    private BigDecimal nextServiceDueOdometer;
    private String notes;
    private List<ServicePartUsageDto> partsUsed = new ArrayList<>();
    private Instant createdAt;

    public ServiceRecordDto() {}

    public static ServiceRecordDto fromEntity(ServiceRecord record) {
        ServiceRecordDto dto = new ServiceRecordDto();
        dto.setId(record.getId());
        dto.setBikeId(record.getBike().getId());
        dto.setBikeRegistrationNumber(record.getBike().getRegistrationNumber());
        dto.setBikeMakeModel(record.getBike().getMake() + " " + record.getBike().getModel());
        dto.setServiceDate(record.getServiceDate());
        dto.setOdometerReading(record.getOdometerReading());
        dto.setServiceProvider(record.getServiceProvider());
        dto.setWorkPerformed(record.getWorkPerformed());
        dto.setLabourCost(record.getLabourCost());
        dto.setLabourCurrency(record.getLabourCurrency());
        dto.setStatus(record.getStatus());
        dto.setNextServiceDueDate(record.getNextServiceDueDate());
        dto.setNextServiceDueOdometer(record.getNextServiceDueOdometer());
        dto.setNotes(record.getNotes());
        dto.setCreatedAt(record.getCreatedAt());

        BigDecimal partsSum = BigDecimal.ZERO;
        if (record.getPartUsages() != null) {
            dto.setPartsUsed(record.getPartUsages().stream()
                    .map(ServicePartUsageDto::fromEntity)
                    .collect(Collectors.toList()));
            for (ServicePartUsageDto partDto : dto.getPartsUsed()) {
                if (partDto.getCurrency().equalsIgnoreCase(record.getLabourCurrency())) {
                    partsSum = partsSum.add(partDto.getTotalCost());
                }
            }
        }
        dto.setPartsCost(partsSum);
        dto.setTotalCost(record.getLabourCost().add(partsSum));

        return dto;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getBikeId() { return bikeId; }
    public void setBikeId(UUID bikeId) { this.bikeId = bikeId; }

    public String getBikeRegistrationNumber() { return bikeRegistrationNumber; }
    public void setBikeRegistrationNumber(String bikeRegistrationNumber) { this.bikeRegistrationNumber = bikeRegistrationNumber; }

    public String getBikeMakeModel() { return bikeMakeModel; }
    public void setBikeMakeModel(String bikeMakeModel) { this.bikeMakeModel = bikeMakeModel; }

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

    public BigDecimal getPartsCost() { return partsCost; }
    public void setPartsCost(BigDecimal partsCost) { this.partsCost = partsCost; }

    public BigDecimal getTotalCost() { return totalCost; }
    public void setTotalCost(BigDecimal totalCost) { this.totalCost = totalCost; }

    public ServiceStatus getStatus() { return status; }
    public void setStatus(ServiceStatus status) { this.status = status; }

    public LocalDate getNextServiceDueDate() { return nextServiceDueDate; }
    public void setNextServiceDueDate(LocalDate nextServiceDueDate) { this.nextServiceDueDate = nextServiceDueDate; }

    public BigDecimal getNextServiceDueOdometer() { return nextServiceDueOdometer; }
    public void setNextServiceDueOdometer(BigDecimal nextServiceDueOdometer) { this.nextServiceDueOdometer = nextServiceDueOdometer; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public List<ServicePartUsageDto> getPartsUsed() { return partsUsed; }
    public void setPartsUsed(List<ServicePartUsageDto> partsUsed) { this.partsUsed = partsUsed; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


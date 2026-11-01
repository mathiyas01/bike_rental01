package ro.bikerental.modules.servicing.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.repository.BikeRepository;
import ro.bikerental.modules.inventory.entity.Part;
import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;
import ro.bikerental.modules.inventory.repository.PartRepository;
import ro.bikerental.modules.inventory.repository.StockMovementRepository;
import ro.bikerental.modules.servicing.dto.LogServicePartItem;
import ro.bikerental.modules.servicing.dto.LogServiceRequest;
import ro.bikerental.modules.servicing.dto.ServiceRecordDto;
import ro.bikerental.modules.servicing.entity.ServicePartUsage;
import ro.bikerental.modules.servicing.entity.ServiceRecord;
import ro.bikerental.modules.servicing.entity.ServiceStatus;
import ro.bikerental.modules.servicing.repository.ServicePartUsageRepository;
import ro.bikerental.modules.servicing.repository.ServiceRecordRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ServicingService {

    private final ServiceRecordRepository serviceRecordRepository;
    private final ServicePartUsageRepository servicePartUsageRepository;
    private final BikeRepository bikeRepository;
    private final PartRepository partRepository;
    private final StockMovementRepository stockMovementRepository;
    private final AppUserRepository appUserRepository;

    public ServicingService(ServiceRecordRepository serviceRecordRepository,
                            ServicePartUsageRepository servicePartUsageRepository,
                            BikeRepository bikeRepository,
                            PartRepository partRepository,
                            StockMovementRepository stockMovementRepository,
                            AppUserRepository appUserRepository) {
        this.serviceRecordRepository = serviceRecordRepository;
        this.servicePartUsageRepository = servicePartUsageRepository;
        this.bikeRepository = bikeRepository;
        this.partRepository = partRepository;
        this.stockMovementRepository = stockMovementRepository;
        this.appUserRepository = appUserRepository;
    }

    @Transactional
    public ServiceRecordDto logService(LogServiceRequest request, UUID userId) {
        Bike bike = bikeRepository.findById(request.getMotorbikeId())
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", request.getMotorbikeId()));

        if (bike.isArchived()) {
            throw new BusinessException("Cannot log service for an archived motorbike");
        }

        if (request.getOdometerReading().compareTo(bike.getCurrentOdometer()) < 0) {
            throw new BusinessException("Service odometer reading (" + request.getOdometerReading() +
                    ") cannot be less than current motorbike odometer (" + bike.getCurrentOdometer() + ")");
        }

        AppUser user = null;
        if (userId != null) {
            user = appUserRepository.findById(userId).orElse(null);
        }
        if (user == null) {
            user = appUserRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new BusinessException("No user found in system to record service"));
        }

        // Validate parts availability before making modifications
        List<Part> partsToUse = new ArrayList<>();
        if (request.getPartsUsed() != null) {
            for (LogServicePartItem item : request.getPartsUsed()) {
                Part part = partRepository.findById(item.getPartId())
                        .orElseThrow(() -> new ResourceNotFoundException("Part", item.getPartId()));

                if (!part.isActive()) {
                    throw new BusinessException("Cannot use archived part: " + part.getPartCode());
                }

                if (part.getCurrentQuantity().compareTo(item.getQuantity()) < 0) {
                    throw new BusinessException("Insufficient stock for part " + part.getPartCode() +
                            " (" + part.getName() + "). Required: " + item.getQuantity() +
                            ", Available: " + part.getCurrentQuantity());
                }
                partsToUse.add(part);
            }
        }

        ServiceRecord record = new ServiceRecord(
                bike,
                request.getServiceDate(),
                request.getOdometerReading(),
                request.getServiceProvider(),
                request.getWorkPerformed(),
                request.getLabourCost(),
                request.getLabourCurrency(),
                request.getStatus(),
                request.getNextServiceDueDate(),
                request.getNextServiceDueOdometer(),
                request.getNotes()
        );

        ServiceRecord savedRecord = serviceRecordRepository.save(record);

        // Deduct stock, write immutable movements, and record part usages
        if (request.getPartsUsed() != null) {
            for (int i = 0; i < request.getPartsUsed().size(); i++) {
                LogServicePartItem item = request.getPartsUsed().get(i);
                Part part = partsToUse.get(i);

                part.setCurrentQuantity(part.getCurrentQuantity().subtract(item.getQuantity()));
                partRepository.save(part);

                BigDecimal unitCost = item.getUnitCost() != null ? item.getUnitCost() : part.getDefaultUnitCost();
                String currency = item.getCurrency() != null ? item.getCurrency() : part.getCostCurrency();

                StockMovement movement = new StockMovement(
                        part,
                        item.getQuantity().negate(),
                        StockMovementType.SERVICE_USAGE,
                        "SERVICE_RECORD",
                        savedRecord.getId(),
                        unitCost,
                        currency,
                        "Used in service on motorbike " + bike.getRegistrationNumber(),
                        user
                );
                stockMovementRepository.save(movement);

                ServicePartUsage partUsage = new ServicePartUsage(
                        savedRecord,
                        part,
                        item.getQuantity(),
                        unitCost,
                        currency
                );
                ServicePartUsage savedUsage = servicePartUsageRepository.save(partUsage);
                savedRecord.getPartUsages().add(savedUsage);
            }
        }

        // Update motorbike odometer
        if (request.getOdometerReading().compareTo(bike.getCurrentOdometer()) > 0) {
            bike.setCurrentOdometer(request.getOdometerReading());
            bikeRepository.save(bike);
        }

        return ServiceRecordDto.fromEntity(savedRecord);
    }

    @Transactional(readOnly = true)
    public ServiceRecordDto getServiceById(UUID id) {
        ServiceRecord record = serviceRecordRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Service record", id));
        return ServiceRecordDto.fromEntity(record);
    }

    @Transactional(readOnly = true)
    public List<ServiceRecordDto> getServicesForBike(UUID bikeId) {
        return serviceRecordRepository.findAllByBikeIdOrderByServiceDateDesc(bikeId).stream()
                .map(ServiceRecordDto::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PageResponse<ServiceRecordDto> searchServices(UUID bikeId, ServiceStatus status,
                                                         LocalDate startDate, LocalDate endDate,
                                                         Pageable pageable) {
        Page<ServiceRecord> page = serviceRecordRepository.searchServices(bikeId, status, startDate, endDate, pageable);
        return new PageResponse<>(page.map(ServiceRecordDto::fromEntity));
    }

    @Transactional(readOnly = true)
    public List<ServiceRecordDto> getDueServices(LocalDate asOfDate) {
        LocalDate date = asOfDate != null ? asOfDate : LocalDate.now();
        return serviceRecordRepository.findDueServicesByDate(date).stream()
                .map(ServiceRecordDto::fromEntity)
                .collect(Collectors.toList());
    }
}


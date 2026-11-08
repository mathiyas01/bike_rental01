package ro.bikerental.modules.report.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.repository.BikeRepository;
import ro.bikerental.modules.inventory.repository.PartRepository;
import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;
import ro.bikerental.modules.inventory.repository.StockMovementRepository;
import ro.bikerental.modules.payment.repository.PaymentRepository;
import ro.bikerental.modules.rental.entity.ChargeStatus;
import ro.bikerental.modules.rental.entity.RentalStatus;
import ro.bikerental.modules.rental.repository.RentalChargeRepository;
import ro.bikerental.modules.rental.repository.RentalRepository;
import ro.bikerental.modules.report.dto.BikeRoiDto;
import ro.bikerental.modules.report.dto.DashboardKpiDto;
import ro.bikerental.modules.report.dto.FleetUtilizationDto;
import ro.bikerental.modules.report.dto.DateRangeReportDto;
import ro.bikerental.modules.payment.entity.PaymentStatus;
import ro.bikerental.modules.servicing.entity.ServicePartUsage;
import ro.bikerental.modules.servicing.entity.ServiceRecord;
import ro.bikerental.modules.servicing.repository.ServiceRecordRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class ReportService {

    private final BikeRepository bikeRepository;
    private final RentalRepository rentalRepository;
    private final RentalChargeRepository rentalChargeRepository;
    private final PaymentRepository paymentRepository;
    private final PartRepository partRepository;
    private final ServiceRecordRepository serviceRecordRepository;
    private final StockMovementRepository stockMovementRepository;

    public ReportService(BikeRepository bikeRepository,
                         RentalRepository rentalRepository,
                         RentalChargeRepository rentalChargeRepository,
                         PaymentRepository paymentRepository,
                         PartRepository partRepository,
                         ServiceRecordRepository serviceRecordRepository,
                         StockMovementRepository stockMovementRepository) {
        this.bikeRepository = bikeRepository;
        this.rentalRepository = rentalRepository;
        this.rentalChargeRepository = rentalChargeRepository;
        this.paymentRepository = paymentRepository;
        this.partRepository = partRepository;
        this.serviceRecordRepository = serviceRecordRepository;
        this.stockMovementRepository = stockMovementRepository;
    }

    @Transactional(readOnly = true)
    public DashboardKpiDto getDashboardKpis() {
        DashboardKpiDto dto = new DashboardKpiDto();

        List<Bike> allBikes = bikeRepository.findAll();
        long available = allBikes.stream().filter(b -> !b.isArchived() && b.getStatus() == BikeStatus.AVAILABLE).count();
        long rented = allBikes.stream().filter(b -> !b.isArchived() && b.getStatus() == BikeStatus.RENTED).count();
        long inService = allBikes.stream().filter(b -> !b.isArchived() && b.getStatus() == BikeStatus.IN_SERVICE).count();
        long totalFleet = allBikes.stream().filter(b -> !b.isArchived()).count();

        dto.setAvailableBikesCount(available);
        dto.setActiveRentalsCount(rented);
        dto.setInServiceBikesCount(inService);
        dto.setTotalFleetCount(totalFleet);

        long overdue = rentalChargeRepository.findOverdueOrDueByDate(
                LocalDate.now(),
                List.of(ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID)
        ).size();
        dto.setOverdueChargesCount(overdue);

        long lowStock = partRepository.findLowStockParts().size();
        dto.setLowStockPartsCount(lowStock);

        // Monthly revenues
        LocalDate startOfMonth = LocalDate.now().withDayOfMonth(1);
        LocalDate endOfMonth = LocalDate.now();
        List<Object[]> revenueRows = paymentRepository.sumConfirmedPaymentsByCurrency(startOfMonth, endOfMonth);
        for (Object[] row : revenueRows) {
            String currency = ((String) row[0]).toUpperCase();
            BigDecimal amount = (BigDecimal) row[1];
            if (dto.getMonthlyRevenue().containsKey(currency)) {
                dto.getMonthlyRevenue().put(currency, amount);
            }
        }

        return dto;
    }

    @Transactional(readOnly = true)
    public FleetUtilizationDto getFleetUtilization() {
        List<Bike> allBikes = bikeRepository.findAll();
        long available = allBikes.stream().filter(b -> !b.isArchived() && b.getStatus() == BikeStatus.AVAILABLE).count();
        long rented = allBikes.stream().filter(b -> !b.isArchived() && b.getStatus() == BikeStatus.RENTED).count();
        long inMaintenance = allBikes.stream().filter(b -> !b.isArchived() && b.getStatus() == BikeStatus.IN_SERVICE).count();
        long totalFleet = allBikes.stream().filter(b -> !b.isArchived()).count();

        return new FleetUtilizationDto(totalFleet, rented, available, inMaintenance);
    }

    @Transactional(readOnly = true)
    public BikeRoiDto getBikeRoi(UUID bikeId) {
        Bike bike = bikeRepository.findById(bikeId)
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", bikeId));

        BikeRoiDto dto = new BikeRoiDto();
        dto.setBikeId(bike.getId());
        dto.setRegistrationNumber(bike.getRegistrationNumber());
        dto.setMakeModel(bike.getMake() + " " + bike.getModel());

        // Sum revenue from rental payments for this bike
        paymentRepository.findAllByRentalIdOrderByPaymentDateDesc(bikeId).forEach(p -> {
            String curr = p.getCurrency().toUpperCase();
            if (dto.getTotalRevenue().containsKey(curr)) {
                dto.getTotalRevenue().put(curr, dto.getTotalRevenue().get(curr).add(p.getAmount()));
            }
        });

        // Sum maintenance costs for this bike
        List<ServiceRecord> services = serviceRecordRepository.findAllByBikeIdOrderByServiceDateDesc(bikeId);
        for (ServiceRecord s : services) {
            String curr = s.getLabourCurrency().toUpperCase();
            if (dto.getTotalMaintenanceCost().containsKey(curr)) {
                dto.getTotalMaintenanceCost().put(curr, dto.getTotalMaintenanceCost().get(curr).add(s.getLabourCost()));
            }

            for (ServicePartUsage usage : s.getPartUsages()) {
                String partCurr = usage.getCurrency().toUpperCase();
                BigDecimal partTotal = usage.getQuantity().multiply(usage.getUnitCost());
                if (dto.getTotalMaintenanceCost().containsKey(partCurr)) {
                    dto.getTotalMaintenanceCost().put(partCurr, dto.getTotalMaintenanceCost().get(partCurr).add(partTotal));
                }
            }
        }

        // Calculate net profit per currency
        for (String curr : List.of("RON", "EUR", "USD")) {
            BigDecimal rev = dto.getTotalRevenue().get(curr);
            BigDecimal cost = dto.getTotalMaintenanceCost().get(curr);
            dto.getNetProfit().put(curr, rev.subtract(cost));
        }

        return dto;
    }

    @Transactional(readOnly = true)
    public DateRangeReportDto getDateRangeReport(LocalDate fromDate, LocalDate toDate) {
        if (fromDate.isAfter(toDate)) {
            throw new IllegalArgumentException("fromDate cannot be after toDate");
        }
        DateRangeReportDto dto = new DateRangeReportDto();
        rentalRepository.findAll().stream()
                .filter(r -> isInRange(r.getStartDate(), fromDate, toDate))
                .forEach(r -> {
                    dto.setTotalRentals(dto.getTotalRentals() + 1);
                    if (r.getStatus() == RentalStatus.ACTIVE) dto.setActiveRentals(dto.getActiveRentals() + 1);
                    if (r.getStatus() == RentalStatus.CLOSED) dto.setClosedRentals(dto.getClosedRentals() + 1);
                });
        paymentRepository.findAll().stream()
                .filter(p -> p.getStatus() == PaymentStatus.CONFIRMED)
                .filter(p -> isInRange(p.getPaymentDate(), fromDate, toDate))
                .forEach(p -> add(dto.getRevenue(), p.getCurrency(), safe(p.getAmount())));
        serviceRecordRepository.findAll().stream()
                .filter(s -> isInRange(s.getServiceDate(), fromDate, toDate))
                .forEach(s -> {
                    dto.setServiceCount(dto.getServiceCount() + 1);
                    add(dto.getLabourCost(), s.getLabourCurrency(), safe(s.getLabourCost()));
                    s.getPartUsages().forEach(u -> add(dto.getSparePartsCost(), u.getCurrency(),
                            safe(u.getQuantity()).multiply(safe(u.getUnitCost()))));
                });
        stockMovementRepository.findAll().stream()
                .filter(m -> isInRange(toDate(m.getCreatedAt()), fromDate, toDate))
                .forEach(m -> {
                    BigDecimal quantity = safe(m.getQuantityDelta()).abs();
                    BigDecimal cost = quantity.multiply(safe(m.getUnitCost()));
                    if (m.getMovementType() == StockMovementType.STOCK_IN || m.getMovementType() == StockMovementType.RETURN) {
                        add(dto.getStockInQuantity(), "TOTAL", quantity);
                        add(dto.getStockInCost(), m.getCurrency(), cost);
                    } else if (m.getMovementType() == StockMovementType.STOCK_OUT
                            || m.getMovementType() == StockMovementType.SERVICE_USAGE) {
                        add(dto.getStockOutQuantity(), "TOTAL", quantity);
                        add(dto.getStockOutCost(), m.getCurrency(), cost);
                    }
                });
        return dto;
    }

    private static boolean isInRange(LocalDate date, LocalDate from, LocalDate to) {
        return date != null && !date.isBefore(from) && !date.isAfter(to);
    }

    private static void add(java.util.Map<String, BigDecimal> values, String key, BigDecimal amount) {
        if (key == null || amount == null) return;
        String normalizedKey = key.toUpperCase().trim();
        if (values.containsKey(normalizedKey)) {
            values.put(normalizedKey, values.get(normalizedKey).add(amount));
        }
    }

    private static BigDecimal safe(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private static LocalDate toDate(java.time.Instant timestamp) {
        return timestamp != null ? timestamp.atZone(java.time.ZoneOffset.UTC).toLocalDate() : null;
    }
}

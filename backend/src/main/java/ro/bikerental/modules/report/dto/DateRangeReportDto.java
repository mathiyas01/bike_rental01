package ro.bikerental.modules.report.dto;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

public class DateRangeReportDto {
    private long totalRentals;
    private long activeRentals;
    private long closedRentals;
    private long serviceCount;
    private final Map<String, BigDecimal> revenue = money();
    private final Map<String, BigDecimal> labourCost = money();
    private final Map<String, BigDecimal> sparePartsCost = money();
    private final Map<String, BigDecimal> stockInQuantity = quantity();
    private final Map<String, BigDecimal> stockOutQuantity = quantity();
    private final Map<String, BigDecimal> stockInCost = money();
    private final Map<String, BigDecimal> stockOutCost = money();

    private static Map<String, BigDecimal> money() {
        return new LinkedHashMap<>(Map.of(
                "RON", BigDecimal.ZERO,
                "EUR", BigDecimal.ZERO,
                "USD", BigDecimal.ZERO
        ));
    }

    private static Map<String, BigDecimal> quantity() {
        return new LinkedHashMap<>(Map.of("TOTAL", BigDecimal.ZERO));
    }

    public long getTotalRentals() { return totalRentals; }
    public void setTotalRentals(long totalRentals) { this.totalRentals = totalRentals; }
    public long getActiveRentals() { return activeRentals; }
    public void setActiveRentals(long activeRentals) { this.activeRentals = activeRentals; }
    public long getClosedRentals() { return closedRentals; }
    public void setClosedRentals(long closedRentals) { this.closedRentals = closedRentals; }
    public long getServiceCount() { return serviceCount; }
    public void setServiceCount(long serviceCount) { this.serviceCount = serviceCount; }
    public Map<String, BigDecimal> getRevenue() { return revenue; }
    public Map<String, BigDecimal> getLabourCost() { return labourCost; }
    public Map<String, BigDecimal> getSparePartsCost() { return sparePartsCost; }
    public Map<String, BigDecimal> getStockInQuantity() { return stockInQuantity; }
    public Map<String, BigDecimal> getStockOutQuantity() { return stockOutQuantity; }
    public Map<String, BigDecimal> getStockInCost() { return stockInCost; }
    public Map<String, BigDecimal> getStockOutCost() { return stockOutCost; }
}

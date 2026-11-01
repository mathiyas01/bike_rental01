package ro.bikerental.modules.report.dto;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

public class DashboardKpiDto {

    private long activeRentalsCount;
    private long availableBikesCount;
    private long inServiceBikesCount;
    private long totalFleetCount;
    private long overdueChargesCount;
    private long lowStockPartsCount;

    private Map<String, BigDecimal> monthlyRevenue = new HashMap<>();
    private Map<String, BigDecimal> monthlyExpenses = new HashMap<>();

    public DashboardKpiDto() {
        monthlyRevenue.put("RON", BigDecimal.ZERO);
        monthlyRevenue.put("EUR", BigDecimal.ZERO);
        monthlyRevenue.put("USD", BigDecimal.ZERO);

        monthlyExpenses.put("RON", BigDecimal.ZERO);
        monthlyExpenses.put("EUR", BigDecimal.ZERO);
        monthlyExpenses.put("USD", BigDecimal.ZERO);
    }

    public long getActiveRentalsCount() { return activeRentalsCount; }
    public void setActiveRentalsCount(long activeRentalsCount) { this.activeRentalsCount = activeRentalsCount; }

    public long getAvailableBikesCount() { return availableBikesCount; }
    public void setAvailableBikesCount(long availableBikesCount) { this.availableBikesCount = availableBikesCount; }

    public long getInServiceBikesCount() { return inServiceBikesCount; }
    public void setInServiceBikesCount(long inServiceBikesCount) { this.inServiceBikesCount = inServiceBikesCount; }

    public long getTotalFleetCount() { return totalFleetCount; }
    public void setTotalFleetCount(long totalFleetCount) { this.totalFleetCount = totalFleetCount; }

    public long getOverdueChargesCount() { return overdueChargesCount; }
    public void setOverdueChargesCount(long overdueChargesCount) { this.overdueChargesCount = overdueChargesCount; }

    public long getLowStockPartsCount() { return lowStockPartsCount; }
    public void setLowStockPartsCount(long lowStockPartsCount) { this.lowStockPartsCount = lowStockPartsCount; }

    public Map<String, BigDecimal> getMonthlyRevenue() { return monthlyRevenue; }
    public void setMonthlyRevenue(Map<String, BigDecimal> monthlyRevenue) { this.monthlyRevenue = monthlyRevenue; }

    public Map<String, BigDecimal> getMonthlyExpenses() { return monthlyExpenses; }
    public void setMonthlyExpenses(Map<String, BigDecimal> monthlyExpenses) { this.monthlyExpenses = monthlyExpenses; }
}

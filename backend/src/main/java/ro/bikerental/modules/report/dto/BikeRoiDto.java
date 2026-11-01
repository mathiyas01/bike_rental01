package ro.bikerental.modules.report.dto;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class BikeRoiDto {

    private UUID bikeId;
    private String registrationNumber;
    private String makeModel;
    private Map<String, BigDecimal> totalRevenue = new HashMap<>();
    private Map<String, BigDecimal> totalMaintenanceCost = new HashMap<>();
    private Map<String, BigDecimal> netProfit = new HashMap<>();

    public BikeRoiDto() {
        totalRevenue.put("RON", BigDecimal.ZERO);
        totalRevenue.put("EUR", BigDecimal.ZERO);
        totalRevenue.put("USD", BigDecimal.ZERO);

        totalMaintenanceCost.put("RON", BigDecimal.ZERO);
        totalMaintenanceCost.put("EUR", BigDecimal.ZERO);
        totalMaintenanceCost.put("USD", BigDecimal.ZERO);

        netProfit.put("RON", BigDecimal.ZERO);
        netProfit.put("EUR", BigDecimal.ZERO);
        netProfit.put("USD", BigDecimal.ZERO);
    }

    public UUID getBikeId() { return bikeId; }
    public void setBikeId(UUID bikeId) { this.bikeId = bikeId; }

    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) { this.registrationNumber = registrationNumber; }

    public String getMakeModel() { return makeModel; }
    public void setMakeModel(String makeModel) { this.makeModel = makeModel; }

    public Map<String, BigDecimal> getTotalRevenue() { return totalRevenue; }
    public void setTotalRevenue(Map<String, BigDecimal> totalRevenue) { this.totalRevenue = totalRevenue; }

    public Map<String, BigDecimal> getTotalMaintenanceCost() { return totalMaintenanceCost; }
    public void setTotalMaintenanceCost(Map<String, BigDecimal> totalMaintenanceCost) { this.totalMaintenanceCost = totalMaintenanceCost; }

    public Map<String, BigDecimal> getNetProfit() { return netProfit; }
    public void setNetProfit(Map<String, BigDecimal> netProfit) { this.netProfit = netProfit; }
}

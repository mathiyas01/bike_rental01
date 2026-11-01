package ro.bikerental.modules.report.dto;

public class FleetUtilizationDto {

    private long totalBikes;
    private long rentedBikes;
    private long availableBikes;
    private long inMaintenanceBikes;
    private double utilizationRate;

    public FleetUtilizationDto() {}

    public FleetUtilizationDto(long totalBikes, long rentedBikes, long availableBikes, long inMaintenanceBikes) {
        this.totalBikes = totalBikes;
        this.rentedBikes = rentedBikes;
        this.availableBikes = availableBikes;
        this.inMaintenanceBikes = inMaintenanceBikes;
        this.utilizationRate = totalBikes > 0 ? (double) rentedBikes / totalBikes * 100.0 : 0.0;
    }

    public long getTotalBikes() { return totalBikes; }
    public void setTotalBikes(long totalBikes) { this.totalBikes = totalBikes; }

    public long getRentedBikes() { return rentedBikes; }
    public void setRentedBikes(long rentedBikes) { this.rentedBikes = rentedBikes; }

    public long getAvailableBikes() { return availableBikes; }
    public void setAvailableBikes(long availableBikes) { this.availableBikes = availableBikes; }

    public long getInMaintenanceBikes() { return inMaintenanceBikes; }
    public void setInMaintenanceBikes(long inMaintenanceBikes) { this.inMaintenanceBikes = inMaintenanceBikes; }

    public double getUtilizationRate() { return utilizationRate; }
    public void setUtilizationRate(double utilizationRate) { this.utilizationRate = utilizationRate; }
}

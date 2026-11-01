class FleetUtilization {
  final int totalBikes;
  final int rentedBikes;
  final int availableBikes;
  final int inMaintenanceBikes;
  final double utilizationRate;

  FleetUtilization({
    required this.totalBikes,
    required this.rentedBikes,
    required this.availableBikes,
    required this.inMaintenanceBikes,
    required this.utilizationRate,
  });

  factory FleetUtilization.fromJson(Map<String, dynamic> json) {
    return FleetUtilization(
      totalBikes: json['totalBikes'] ?? 0,
      rentedBikes: json['rentedBikes'] ?? 0,
      availableBikes: json['availableBikes'] ?? 0,
      inMaintenanceBikes: json['inMaintenanceBikes'] ?? 0,
      utilizationRate: (json['utilizationRate'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class BikeRoi {
  final String bikeId;
  final String registrationNumber;
  final String makeModel;
  final Map<String, double> totalRevenue;
  final Map<String, double> totalMaintenanceCost;
  final Map<String, double> netProfit;

  BikeRoi({
    required this.bikeId,
    required this.registrationNumber,
    required this.makeModel,
    required this.totalRevenue,
    required this.totalMaintenanceCost,
    required this.netProfit,
  });

  factory BikeRoi.fromJson(Map<String, dynamic> json) {
    Map<String, double> parseMap(Map<String, dynamic>? m) {
      if (m == null) return {'RON': 0.0, 'EUR': 0.0, 'USD': 0.0};
      return m.map((k, v) => MapEntry(k, (v as num?)?.toDouble() ?? 0.0));
    }

    return BikeRoi(
      bikeId: json['bikeId'] ?? '',
      registrationNumber: json['registrationNumber'] ?? '',
      makeModel: json['makeModel'] ?? '',
      totalRevenue: parseMap(json['totalRevenue']),
      totalMaintenanceCost: parseMap(json['totalMaintenanceCost']),
      netProfit: parseMap(json['netProfit']),
    );
  }
}


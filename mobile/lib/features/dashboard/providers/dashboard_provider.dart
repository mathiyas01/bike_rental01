import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_endpoints.dart';
import '../../auth/providers/auth_provider.dart';

class DashboardData {
  final int activeRentals;
  final int availableBikes;
  final int inServiceBikes;
  final int totalFleet;
  final int overdueCharges;
  final int lowStockParts;
  final Map<String, double> monthlyRevenue;
  final double utilizationRate;

  DashboardData({
    required this.activeRentals,
    required this.availableBikes,
    required this.inServiceBikes,
    required this.totalFleet,
    required this.overdueCharges,
    required this.lowStockParts,
    required this.monthlyRevenue,
    required this.utilizationRate,
  });

  factory DashboardData.fromJson(Map<String, dynamic> kpiJson, Map<String, dynamic> utilJson) {
    final revMap = <String, double>{};
    if (kpiJson['monthlyRevenue'] is Map) {
      (kpiJson['monthlyRevenue'] as Map).forEach((k, v) {
        revMap[k.toString()] = (v as num).toDouble();
      });
    }

    return DashboardData(
      activeRentals: (kpiJson['activeRentalsCount'] as num?)?.toInt() ?? 0,
      availableBikes: (kpiJson['availableBikesCount'] as num?)?.toInt() ?? 0,
      inServiceBikes: (kpiJson['inServiceBikesCount'] as num?)?.toInt() ?? 0,
      totalFleet: (kpiJson['totalFleetCount'] as num?)?.toInt() ?? 0,
      overdueCharges: (kpiJson['overdueChargesCount'] as num?)?.toInt() ?? 0,
      lowStockParts: (kpiJson['lowStockPartsCount'] as num?)?.toInt() ?? 0,
      monthlyRevenue: revMap,
      utilizationRate: (utilJson['utilizationRate'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

final dashboardDataProvider = FutureProvider<DashboardData>((ref) async {
  final client = ref.watch(apiClientProvider);

  final kpiResponse = await client.dio.get(ApiEndpoints.reportsDashboard);
  final utilResponse = await client.dio.get(ApiEndpoints.reportsUtilization);

  return DashboardData.fromJson(
    kpiResponse.data as Map<String, dynamic>,
    utilResponse.data as Map<String, dynamic>,
  );
});

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../models/report_model.dart';

class ReportState {
  final bool isLoading;
  final FleetUtilization? fleetUtilization;
  final List<BikeRoi> bikeRois;
  final String? error;

  ReportState({
    this.isLoading = false,
    this.fleetUtilization,
    this.bikeRois = const [],
    this.error,
  });

  ReportState copyWith({
    bool? isLoading,
    FleetUtilization? fleetUtilization,
    List<BikeRoi>? bikeRois,
    String? error,
  }) {
    return ReportState(
      isLoading: isLoading ?? this.isLoading,
      fleetUtilization: fleetUtilization ?? this.fleetUtilization,
      bikeRois: bikeRois ?? this.bikeRois,
      error: error,
    );
  }
}

class ReportNotifier extends StateNotifier<ReportState> {
  final ApiClient _apiClient;

  ReportNotifier(this._apiClient) : super(ReportState()) {
    loadReports();
  }

  Future<void> loadReports() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // 1. Fetch Fleet Utilization
      final utilRes = await _apiClient.dio.get(ApiEndpoints.reportsUtilization);
      final util = FleetUtilization.fromJson(utilRes.data);

      // 2. Fetch all bikes to calculate ROI for each
      final bikesRes = await _apiClient.dio.get(
        ApiEndpoints.bikes,
        queryParameters: {'page': 0, 'size': 50},
      );
      final List bikeContent = bikesRes.data['content'] ?? [];

      final List<BikeRoi> rois = [];
      for (final b in bikeContent) {
        final bikeId = b['id'];
        try {
          final roiRes = await _apiClient.dio.get('${ApiEndpoints.reportsBikeRoi}/$bikeId');
          rois.add(BikeRoi.fromJson(roiRes.data));
        } catch (_) {}
      }

      state = state.copyWith(
        isLoading: false,
        fleetUtilization: util,
        bikeRois: rois,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final reportProvider = StateNotifierProvider<ReportNotifier, ReportState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ReportNotifier(apiClient);
});


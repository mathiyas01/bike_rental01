import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../models/service_model.dart';

class ServiceState {
  final bool isLoading;
  final List<ServiceRecord> services;
  final String? error;
  final String? selectedBikeId;

  ServiceState({
    this.isLoading = false,
    this.services = const [],
    this.error,
    this.selectedBikeId,
  });

  ServiceState copyWith({
    bool? isLoading,
    List<ServiceRecord>? services,
    String? error,
    String? selectedBikeId,
  }) {
    return ServiceState(
      isLoading: isLoading ?? this.isLoading,
      services: services ?? this.services,
      error: error,
      selectedBikeId: selectedBikeId ?? this.selectedBikeId,
    );
  }
}

class ServiceNotifier extends StateNotifier<ServiceState> {
  final ApiClient _apiClient;

  ServiceNotifier(this._apiClient) : super(ServiceState()) {
    loadServices();
  }

  Future<void> loadServices({String? bikeId}) async {
    state = state.copyWith(isLoading: true, error: null, selectedBikeId: bikeId);
    try {
      final queryParams = <String, dynamic>{
        'page': 0,
        'size': 50,
      };
      if (bikeId != null) {
        queryParams['bikeId'] = bikeId;
      }

      final response = await _apiClient.dio.get(
        ApiEndpoints.services,
        queryParameters: queryParams,
      );

      final List content = response.data['content'] ?? [];
      final records = content.map((e) => ServiceRecord.fromJson(e)).toList();

      state = state.copyWith(
        isLoading: false,
        services: records,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<bool> logService(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiClient.dio.post(
        ApiEndpoints.services,
        data: data,
      );
      await loadServices();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final serviceProvider = StateNotifierProvider<ServiceNotifier, ServiceState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ServiceNotifier(apiClient);
});

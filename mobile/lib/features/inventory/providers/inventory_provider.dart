import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../models/part_model.dart';

class InventoryState {
  final bool isLoading;
  final List<Part> parts;
  final String? error;
  final bool lowStockOnly;
  final String? searchQuery;

  InventoryState({
    this.isLoading = false,
    this.parts = const [],
    this.error,
    this.lowStockOnly = false,
    this.searchQuery,
  });

  InventoryState copyWith({
    bool? isLoading,
    List<Part>? parts,
    String? error,
    bool? lowStockOnly,
    String? searchQuery,
  }) {
    return InventoryState(
      isLoading: isLoading ?? this.isLoading,
      parts: parts ?? this.parts,
      error: error,
      lowStockOnly: lowStockOnly ?? this.lowStockOnly,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }
}

class InventoryNotifier extends StateNotifier<InventoryState> {
  final ApiClient _apiClient;

  InventoryNotifier(this._apiClient) : super(InventoryState()) {
    loadParts();
  }

  Future<void> loadParts() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final queryParams = <String, dynamic>{
        'page': 0,
        'size': 100,
      };
      if (state.lowStockOnly) {
        queryParams['lowStockOnly'] = true;
      }
      if (state.searchQuery != null && state.searchQuery!.isNotEmpty) {
        queryParams['search'] = state.searchQuery;
      }

      final response = await _apiClient.dio.get(
        ApiEndpoints.parts,
        queryParameters: queryParams,
      );

      final List content = response.data['content'] ?? [];
      final parts = content.map((e) => Part.fromJson(e)).toList();

      state = state.copyWith(
        isLoading: false,
        parts: parts,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setFilter({bool? lowStockOnly, String? search}) {
    state = state.copyWith(
      lowStockOnly: lowStockOnly ?? state.lowStockOnly,
      searchQuery: search ?? state.searchQuery,
    );
    loadParts();
  }

  Future<bool> createPart(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiClient.dio.post(
        ApiEndpoints.parts,
        data: data,
      );
      await loadParts();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> recordStockMovement(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiClient.dio.post(
        ApiEndpoints.stockMovements,
        data: data,
      );
      await loadParts();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final inventoryProvider = StateNotifierProvider<InventoryNotifier, InventoryState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return InventoryNotifier(apiClient);
});


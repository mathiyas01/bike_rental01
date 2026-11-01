import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_endpoints.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/bike_model.dart';

class BikeFilterState {
  final String? status;
  final String? search;

  const BikeFilterState({this.status, this.search});

  BikeFilterState copyWith({String? status, String? search, bool clearStatus = false}) {
    return BikeFilterState(
      status: clearStatus ? null : (status ?? this.status),
      search: search ?? this.search,
    );
  }
}

final bikeFilterProvider = StateProvider<BikeFilterState>((ref) {
  return const BikeFilterState();
});

final bikesListProvider = FutureProvider<List<BikeModel>>((ref) async {
  final client = ref.watch(apiClientProvider);
  final filter = ref.watch(bikeFilterProvider);

  final queryParams = <String, dynamic>{
    'size': 50,
  };
  if (filter.status != null && filter.status!.isNotEmpty) {
    queryParams['status'] = filter.status;
  }
  if (filter.search != null && filter.search!.isNotEmpty) {
    queryParams['search'] = filter.search;
  }

  final response = await client.dio.get(
    ApiEndpoints.bikes,
    queryParameters: queryParams,
  );

  final content = response.data['content'] as List;
  return content.map((item) => BikeModel.fromJson(item as Map<String, dynamic>)).toList();
});

final bikeDetailProvider = FutureProvider.family<BikeModel, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get('${ApiEndpoints.bikes}/$id');
  return BikeModel.fromJson(response.data as Map<String, dynamic>);
});

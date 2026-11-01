import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_endpoints.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/rental_model.dart';

final rentalStatusFilterProvider = StateProvider<String?>((ref) => null);

final rentalsListProvider = FutureProvider<List<RentalModel>>((ref) async {
  final client = ref.watch(apiClientProvider);
  final status = ref.watch(rentalStatusFilterProvider);

  final queryParams = <String, dynamic>{'size': 50};
  if (status != null && status.isNotEmpty) queryParams['status'] = status;

  final response = await client.dio.get(
    ApiEndpoints.rentals,
    queryParameters: queryParams,
  );

  final content = response.data['content'] as List;
  return content.map((item) => RentalModel.fromJson(item as Map<String, dynamic>)).toList();
});

final rentalDetailProvider = FutureProvider.family<RentalModel, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get('${ApiEndpoints.rentals}/$id');
  return RentalModel.fromJson(response.data as Map<String, dynamic>);
});

final rentalChargesProvider = FutureProvider.family<List<RentalChargeModel>, String>((ref, rentalId) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get('${ApiEndpoints.rentalCharges}/rental/$rentalId');
  final list = response.data as List;
  return list.map((item) => RentalChargeModel.fromJson(item as Map<String, dynamic>)).toList();
});

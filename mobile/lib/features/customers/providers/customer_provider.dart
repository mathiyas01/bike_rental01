import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_endpoints.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/customer_model.dart';

final customerSearchProvider = StateProvider<String>((ref) => '');

final customersListProvider = FutureProvider<List<CustomerModel>>((ref) async {
  final client = ref.watch(apiClientProvider);
  final search = ref.watch(customerSearchProvider);

  final queryParams = <String, dynamic>{'size': 50};
  if (search.isNotEmpty) queryParams['search'] = search;

  final response = await client.dio.get(
    ApiEndpoints.customers,
    queryParameters: queryParams,
  );

  final content = response.data['content'] as List;
  return content.map((item) => CustomerModel.fromJson(item as Map<String, dynamic>)).toList();
});

final customerDetailProvider = FutureProvider.family<CustomerModel, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get('${ApiEndpoints.customers}/$id');
  return CustomerModel.fromJson(response.data as Map<String, dynamic>);
});

final customerBalanceProvider = FutureProvider.family<CustomerBalanceSummary, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get('${ApiEndpoints.customers}/$id/balance-summary');
  return CustomerBalanceSummary.fromJson(response.data as Map<String, dynamic>);
});

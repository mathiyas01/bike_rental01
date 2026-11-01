import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_endpoints.dart';
import '../models/payment_model.dart';

class PaymentState {
  final bool isLoading;
  final List<Payment> payments;
  final String? error;
  final String? filterCurrency;
  final String? filterStatus;

  PaymentState({
    this.isLoading = false,
    this.payments = const [],
    this.error,
    this.filterCurrency,
    this.filterStatus,
  });

  PaymentState copyWith({
    bool? isLoading,
    List<Payment>? payments,
    String? error,
    String? filterCurrency,
    String? filterStatus,
  }) {
    return PaymentState(
      isLoading: isLoading ?? this.isLoading,
      payments: payments ?? this.payments,
      error: error,
      filterCurrency: filterCurrency ?? this.filterCurrency,
      filterStatus: filterStatus ?? this.filterStatus,
    );
  }
}

class PaymentNotifier extends StateNotifier<PaymentState> {
  final ApiClient _apiClient;

  PaymentNotifier(this._apiClient) : super(PaymentState()) {
    loadPayments();
  }

  Future<void> loadPayments() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final queryParams = <String, dynamic>{
        'page': 0,
        'size': 50,
      };
      if (state.filterCurrency != null) {
        queryParams['currency'] = state.filterCurrency;
      }
      if (state.filterStatus != null) {
        queryParams['status'] = state.filterStatus;
      }

      final response = await _apiClient.dio.get(
        ApiEndpoints.payments,
        queryParameters: queryParams,
      );

      final List content = response.data['content'] ?? [];
      final payments = content.map((e) => Payment.fromJson(e)).toList();

      state = state.copyWith(
        isLoading: false,
        payments: payments,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  void setFilter({String? currency, String? status}) {
    state = state.copyWith(
      filterCurrency: currency,
      filterStatus: status,
    );
    loadPayments();
  }

  Future<bool> recordPayment(Map<String, dynamic> data) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiClient.dio.post(
        ApiEndpoints.payments,
        data: data,
      );
      await loadPayments();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }

  Future<bool> reversePayment(String paymentId, String reason) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _apiClient.dio.post(
        '${ApiEndpoints.payments}/$paymentId/reverse',
        data: {'reversalReason': reason},
      );
      await loadPayments();
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return false;
    }
  }
}

final paymentProvider = StateNotifierProvider<PaymentNotifier, PaymentState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return PaymentNotifier(apiClient);
});

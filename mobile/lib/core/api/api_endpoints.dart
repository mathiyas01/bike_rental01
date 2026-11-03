import 'dart:io';
import 'package:flutter/foundation.dart';

class ApiEndpoints {
  // Override for a physical device with:
  // flutter build apk --release --dart-define=API_BASE_URL=http://192.168.x.x:8081
  static String get defaultBaseUrl {
    const configuredUrl = String.fromEnvironment('API_BASE_URL');
    if (configuredUrl.isNotEmpty) return configuredUrl;
    if (kIsWeb) return 'http://localhost:8081';
    try {
      if (Platform.isAndroid) return 'http://10.0.2.2:8081';
    } catch (_) {}
    return 'http://localhost:8081';
  }

  // Auth
  static const String login = '/api/v1/auth/login';
  static const String bootstrapOwner = '/api/v1/auth/bootstrap-owner';
  static const String profile = '/api/v1/auth/profile';
  static const String updateLanguage = '/api/v1/auth/profile/language';
  static const String updateCurrency = '/api/v1/auth/profile/currency';

  // Motorbikes
  static const String bikes = '/api/v1/bikes';

  // Customers
  static const String customers = '/api/v1/customers';

  // Rentals
  static const String rentals = '/api/v1/rentals';
  static const String rentalCharges = '/api/v1/rental-charges';

  // Payments
  static const String payments = '/api/v1/payments';

  // Inventory
  static const String parts = '/api/v1/parts';
  static const String suppliers = '/api/v1/suppliers';
  static const String stockMovements = '/api/v1/stock-movements';

  // Servicing
  static const String services = '/api/v1/services';

  // Reports
  static const String reportsDashboard = '/api/v1/reports/dashboard';
  static const String reportsUtilization = '/api/v1/reports/fleet-utilization';
  static const String reportsBikeRoi = '/api/v1/reports/bike-roi';
}

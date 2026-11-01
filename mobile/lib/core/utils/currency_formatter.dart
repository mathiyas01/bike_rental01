import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';

class CurrencyFormatter {
  static final NumberFormat _ronFormat = NumberFormat('#,##0.00', 'ro_RO');
  static final NumberFormat _standardFormat = NumberFormat('#,##0.00', 'en_US');

  /// Formats amount with strict currency symbol/code placement
  static String format(num? amount, String? currency, {String locale = 'en'}) {
    final val = amount ?? 0.0;
    final curr = (currency ?? 'RON').toUpperCase().trim();

    switch (curr) {
      case 'EUR':
        return '€${_standardFormat.format(val)}';
      case 'USD':
        return '\$${_standardFormat.format(val)}';
      case 'RON':
      default:
        if (locale == 'ro') {
          return '${_ronFormat.format(val)} RON';
        }
        return 'RON ${_standardFormat.format(val)}';
    }
  }

  /// Returns the signature pocket color for this currency
  static Color getCurrencyColor(String? currency) {
    final curr = (currency ?? 'RON').toUpperCase().trim();
    switch (curr) {
      case 'EUR':
        return AppColors.currencyEur;
      case 'USD':
        return AppColors.currencyUsd;
      case 'RON':
      default:
        return AppColors.currencyRon;
    }
  }
}

import 'package:flutter/material.dart';
import '../utils/currency_formatter.dart';

class CurrencyChip extends StatelessWidget {
  final String currency;
  final bool isSelected;
  final VoidCallback? onTap;

  const CurrencyChip({
    super.key,
    required this.currency,
    this.isSelected = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = CurrencyFormatter.getCurrencyColor(currency);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? color : color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: color.withValues(alpha: isSelected ? 1.0 : 0.3),
            width: isSelected ? 1.5 : 1.0,
          ),
        ),
        child: Text(
          currency.toUpperCase(),
          style: TextStyle(
            color: isSelected ? Colors.white : color,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}

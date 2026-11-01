import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final String? label;

  const StatusBadge({
    super.key,
    required this.status,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    IconData icon;

    final s = status.toUpperCase().trim();
    switch (s) {
      case 'AVAILABLE':
      case 'ACTIVE':
      case 'PAID':
      case 'CONFIRMED':
      case 'COMPLETED':
        bg = AppColors.success.withValues(alpha: 0.15);
        fg = AppColors.success;
        icon = Icons.check_circle_outline;
        break;
      case 'RENTED':
      case 'IN_PROGRESS':
      case 'PARTIALLY_PAID':
      case 'PLANNED':
        bg = AppColors.primary.withValues(alpha: 0.15);
        fg = AppColors.primaryLight;
        icon = Icons.sync;
        break;
      case 'IN_SERVICE':
      case 'MAINTENANCE':
        bg = AppColors.warning.withValues(alpha: 0.15);
        fg = AppColors.warning;
        icon = Icons.build_circle_outlined;
        break;
      case 'UNPAID':
      case 'CANCELLED':
      case 'REVERSED':
      case 'INACTIVE':
        bg = AppColors.danger.withValues(alpha: 0.15);
        fg = AppColors.danger;
        icon = Icons.error_outline;
        break;
      case 'CLOSED':
      default:
        bg = AppColors.neutral.withValues(alpha: 0.15);
        fg = AppColors.neutral;
        icon = Icons.info_outline;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: fg.withValues(alpha: 0.3), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: fg),
          const SizedBox(width: 4),
          Text(
            label ?? status,
            style: TextStyle(
              color: fg,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../providers/bike_provider.dart';

class BikeListScreen extends ConsumerWidget {
  const BikeListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final filter = ref.watch(bikeFilterProvider);
    final bikesAsync = ref.watch(bikesListProvider);

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        title: Text(l10n.bikeTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.refresh(bikesListProvider),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/bikes/add'),
        icon: const Icon(Icons.add),
        label: Text(l10n.bikeAdd),
      ),
      body: Column(
        children: [
          // Search & Filter Header
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16.0,
              vertical: 8.0,
            ),
            child: TextField(
              decoration: InputDecoration(
                hintText:
                    '${l10n.commonSearch} (${l10n.bikePlate}, ${l10n.bikeMake}, ${l10n.bikeModel})',
                prefixIcon: const Icon(Icons.search, size: 20),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
              ),
              onChanged: (val) {
                ref.read(bikeFilterProvider.notifier).state = filter.copyWith(
                  search: val.trim(),
                );
              },
            ),
          ),

          // Horizontal Status Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(
              horizontal: 16.0,
              vertical: 4.0,
            ),
            child: Row(
              children: [
                _StatusFilterChip(
                  label: 'All',
                  isSelected: filter.status == null,
                  onSelected: () =>
                      ref.read(bikeFilterProvider.notifier).state = filter
                          .copyWith(clearStatus: true),
                ),
                const SizedBox(width: 8),
                _StatusFilterChip(
                  label: l10n.statusAvailable,
                  isSelected: filter.status == 'AVAILABLE',
                  onSelected: () =>
                      ref.read(bikeFilterProvider.notifier).state = filter
                          .copyWith(status: 'AVAILABLE'),
                ),
                const SizedBox(width: 8),
                _StatusFilterChip(
                  label: l10n.statusRented,
                  isSelected: filter.status == 'RENTED',
                  onSelected: () =>
                      ref.read(bikeFilterProvider.notifier).state = filter
                          .copyWith(status: 'RENTED'),
                ),
                const SizedBox(width: 8),
                _StatusFilterChip(
                  label: l10n.statusInService,
                  isSelected: filter.status == 'IN_SERVICE',
                  onSelected: () =>
                      ref.read(bikeFilterProvider.notifier).state = filter
                          .copyWith(status: 'IN_SERVICE'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Bike List
          Expanded(
            child: bikesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(
                child: Text(
                  err.toString(),
                  style: const TextStyle(color: AppColors.danger),
                ),
              ),
              data: (bikes) {
                if (bikes.isEmpty) {
                  return EmptyState(
                    icon: Icons.two_wheeler_outlined,
                    title: 'No motorbikes found',
                    subtitle: 'Add a new bike to your fleet to start renting.',
                    actionLabel: l10n.bikeAdd,
                    onAction: () => context.push('/bikes/add'),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.refresh(bikesListProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.only(
                      left: 16,
                      right: 16,
                      bottom: 80,
                      top: 4,
                    ),
                    itemCount: bikes.length,
                    itemBuilder: (context, index) {
                      final bike = bikes[index];
                      final isItpExpired = DateFormatter.isExpired(
                        bike.itpExpiryDate,
                      );
                      final isRcaExpired = DateFormatter.isExpired(
                        bike.rcaExpiryDate,
                      );

                      return Card(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () => context.push('/bikes/${bike.id}'),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.all(8),
                                          decoration: BoxDecoration(
                                            color: AppColors.primary.withValues(
                                              alpha: 0.15,
                                            ),
                                            borderRadius: BorderRadius.circular(
                                              8,
                                            ),
                                          ),
                                          child: const Icon(
                                            Icons.two_wheeler,
                                            color: AppColors.primaryLight,
                                            size: 20,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Text(
                                          bike.registrationNumber,
                                          style: const TextStyle(
                                            fontSize: 17,
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                                    StatusBadge(
                                      status: bike.status,
                                      label: _getStatusLabel(bike.status, l10n),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  '${bike.make} ${bike.model} (${bike.yearOfManufacture})',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${l10n.bikeOdometer}: ${bike.currentOdometer.toStringAsFixed(0)} km  •  VIN: ${bike.vin}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textDarkSecondary,
                                  ),
                                ),
                                const SizedBox(height: 10),

                                // Compliance Expiry Badges
                                Row(
                                  children: [
                                    if (bike.itpExpiryDate != null)
                                      _ComplianceBadge(
                                        label:
                                            'ITP: ${DateFormatter.formatDate(bike.itpExpiryDate)}',
                                        isExpired: isItpExpired,
                                      ),
                                    if (bike.itpExpiryDate != null &&
                                        bike.rcaExpiryDate != null)
                                      const SizedBox(width: 8),
                                    if (bike.rcaExpiryDate != null)
                                      _ComplianceBadge(
                                        label:
                                            'RCA: ${DateFormatter.formatDate(bike.rcaExpiryDate)}',
                                        isExpired: isRcaExpired,
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Icon(
                                      Icons.schedule_outlined,
                                      size: 16,
                                      color: AppColors.textDarkSecondary,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Next service: ${bike.nextServiceDueDate != null ? DateFormatter.formatDate(bike.nextServiceDueDate) : 'Not serviced yet'}',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textDarkSecondary,
                                      ),
                                    ),
                                    const Spacer(),
                                    TextButton.icon(
                                      onPressed: () => context.push(
                                        '/servicing/log?bikeId=${bike.id}',
                                      ),
                                      icon: const Icon(
                                        Icons.build_outlined,
                                        size: 16,
                                      ),
                                      label: const Text('Add to service'),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  String _getStatusLabel(String status, AppLocalizations l10n) {
    switch (status.toUpperCase()) {
      case 'AVAILABLE':
        return l10n.statusAvailable;
      case 'RENTED':
        return l10n.statusRented;
      case 'IN_SERVICE':
        return l10n.statusInService;
      default:
        return status;
    }
  }
}

class _StatusFilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onSelected;

  const _StatusFilterChip({
    required this.label,
    required this.isSelected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => onSelected(),
      selectedColor: AppColors.primary.withValues(alpha: 0.25),
      labelStyle: TextStyle(
        color: isSelected
            ? AppColors.primaryLight
            : AppColors.textDarkSecondary,
        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
        fontSize: 13,
      ),
    );
  }
}

class _ComplianceBadge extends StatelessWidget {
  final String label;
  final bool isExpired;

  const _ComplianceBadge({required this.label, required this.isExpired});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: (isExpired ? AppColors.danger : AppColors.neutral).withValues(
          alpha: 0.15,
        ),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: (isExpired ? AppColors.danger : AppColors.neutral).withValues(
            alpha: 0.3,
          ),
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: isExpired ? AppColors.danger : AppColors.textDarkSecondary,
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../providers/rental_provider.dart';

class RentalListScreen extends ConsumerWidget {
  const RentalListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final statusFilter = ref.watch(rentalStatusFilterProvider);
    final rentalsAsync = ref.watch(rentalsListProvider);

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        title: Text(l10n.rentalTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.refresh(rentalsListProvider),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/rentals/create'),
        icon: const Icon(Icons.note_add),
        label: Text(l10n.rentalCreate),
      ),
      body: Column(
        children: [
          // Filter Chips (All, Active, Closed)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(
              horizontal: 16.0,
              vertical: 8.0,
            ),
            child: Row(
              children: [
                ChoiceChip(
                  label: const Text('All'),
                  selected: statusFilter == null,
                  onSelected: (_) =>
                      ref.read(rentalStatusFilterProvider.notifier).state =
                          null,
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(l10n.statusActive),
                  selected: statusFilter == 'ACTIVE',
                  onSelected: (_) =>
                      ref.read(rentalStatusFilterProvider.notifier).state =
                          'ACTIVE',
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: Text(l10n.statusClosed),
                  selected: statusFilter == 'CLOSED',
                  onSelected: (_) =>
                      ref.read(rentalStatusFilterProvider.notifier).state =
                          'CLOSED',
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),

          // List
          Expanded(
            child: rentalsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(
                child: Text(
                  err.toString(),
                  style: const TextStyle(color: AppColors.danger),
                ),
              ),
              data: (rentals) {
                if (rentals.isEmpty) {
                  return EmptyState(
                    icon: Icons.description_outlined,
                    title: 'No rental agreements found',
                    subtitle:
                        'Create a rental contract to assign a bike to a customer.',
                    actionLabel: l10n.rentalCreate,
                    onAction: () => context.push('/rentals/create'),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.refresh(rentalsListProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.only(
                      left: 16,
                      right: 16,
                      bottom: 80,
                      top: 4,
                    ),
                    itemCount: rentals.length,
                    itemBuilder: (context, index) {
                      final rental = rentals[index];

                      return Card(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () => context.push('/rentals/${rental.id}'),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      rental.bikeRegistrationNumber,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                      ),
                                    ),
                                    StatusBadge(
                                      status: rental.status,
                                      label: rental.status,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  rental.customerName,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${rental.bikeMakeModel}  •  ${rental.customerPhone}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textDarkSecondary,
                                  ),
                                ),
                                const Divider(height: 16),
                                Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      'Start: ${DateFormatter.formatDate(rental.startDate)}',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textDarkSecondary,
                                      ),
                                    ),
                                    Text(
                                      '${CurrencyFormatter.format(rental.weeklyRate, rental.currency)} / week',
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                        color:
                                            CurrencyFormatter.getCurrencyColor(
                                              rental.currency,
                                            ),
                                      ),
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
}

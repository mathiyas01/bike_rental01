import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../l10n/app_localizations.dart';
import '../providers/customer_provider.dart';

class CustomerListScreen extends ConsumerWidget {
  const CustomerListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final customersAsync = ref.watch(customersListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.customerTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.refresh(customersListProvider),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/customers/add'),
        icon: const Icon(Icons.person_add),
        label: Text(l10n.customerAdd),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: TextField(
              decoration: InputDecoration(
                hintText: '${l10n.commonSearch} (${l10n.customerName}, ${l10n.customerPhone}, CNP)',
                prefixIcon: const Icon(Icons.search, size: 20),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
              onChanged: (val) {
                ref.read(customerSearchProvider.notifier).state = val.trim();
              },
            ),
          ),
          Expanded(
            child: customersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => Center(child: Text(err.toString(), style: const TextStyle(color: AppColors.danger))),
              data: (customers) {
                if (customers.isEmpty) {
                  return EmptyState(
                    icon: Icons.people_outline,
                    title: 'No customers registered',
                    subtitle: 'Register customer profiles to create rental agreements.',
                    actionLabel: l10n.customerAdd,
                    onAction: () => context.push('/customers/add'),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.refresh(customersListProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.only(left: 16, right: 16, bottom: 80, top: 4),
                    itemCount: customers.length,
                    itemBuilder: (context, index) {
                      final customer = customers[index];

                      return Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          leading: CircleAvatar(
                            backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                            child: Text(
                              customer.fullName.isNotEmpty ? customer.fullName[0].toUpperCase() : '?',
                              style: const TextStyle(color: AppColors.primaryLight, fontWeight: FontWeight.bold),
                            ),
                          ),
                          title: Text(
                            customer.fullName,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 4),
                              Text(
                                '${customer.phone}  •  ${customer.email ?? 'No email'}',
                                style: const TextStyle(fontSize: 12, color: AppColors.textDarkSecondary),
                              ),
                              if (customer.drivingLicenceNumber != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  'Licence: ${customer.drivingLicenceNumber} (${customer.licenceCategories ?? 'A, B'})',
                                  style: const TextStyle(fontSize: 11, color: AppColors.primaryLight),
                                ),
                              ],
                            ],
                          ),
                          trailing: const Icon(Icons.chevron_right, color: AppColors.textDarkSecondary),
                          onTap: () => context.push('/customers/${customer.id}'),
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

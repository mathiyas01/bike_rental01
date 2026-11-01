import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../models/service_model.dart';
import '../providers/service_provider.dart';

class ServiceListScreen extends ConsumerWidget {
  const ServiceListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final serviceState = ref.watch(serviceProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.serviceTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(serviceProvider.notifier).loadServices(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/servicing/log'),
        icon: const Icon(Icons.add),
        label: Text(l10n.serviceLog),
      ),
      body: serviceState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : serviceState.services.isEmpty
              ? const EmptyState(
                  icon: Icons.build_outlined,
                  title: 'No Service Records',
                  subtitle: 'Log maintenance, oil changes, or repair work.',
                )
              : RefreshIndicator(
                  onRefresh: () =>
                      ref.read(serviceProvider.notifier).loadServices(),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: serviceState.services.length,
                    separatorBuilder: (_, index) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final service = serviceState.services[index];
                      return _buildServiceCard(context, service, l10n);
                    },
                  ),
                ),
    );
  }

  Widget _buildServiceCard(
      BuildContext context, ServiceRecord record, AppLocalizations l10n) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant.withAlpha(80),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        record.bikeRegistrationNumber,
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color:
                              Theme.of(context).colorScheme.onPrimaryContainer,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      record.bikeMakeModel,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                StatusBadge(status: record.status),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.store_outlined, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    record.serviceProvider,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ),
                Text(
                  DateFormatter.formatDate(record.serviceDate),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.speed, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Text(
                  '${record.odometerReading.toStringAsFixed(0)} km',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            const Divider(height: 16),
            Text(
              l10n.serviceWork,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 2),
            Text(record.workPerformed),
            if (record.partsUsed.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '${l10n.serviceParts} (${record.partsUsed.length}):',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              for (final part in record.partsUsed)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 1),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${part.partName} x ${part.quantity.toStringAsFixed(0)}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      Text(
                        CurrencyFormatter.format(part.totalCost, part.currency),
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
            ],
            const Divider(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Labour: ${CurrencyFormatter.format(record.labourCost, record.labourCurrency)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                Text(
                  'Total: ${CurrencyFormatter.format(record.totalCost, record.labourCurrency)}',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                ),
              ],
            ),
            if (record.nextServiceDueDate != null ||
                record.nextServiceDueOdometer != null) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.amber.withAlpha(25),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.alarm, size: 16, color: Colors.orange),
                    const SizedBox(width: 6),
                    Text(
                      'Next Due: ${record.nextServiceDueDate != null ? DateFormatter.formatDate(record.nextServiceDueDate!) : ''} ${record.nextServiceDueOdometer != null ? '(${record.nextServiceDueOdometer!.toStringAsFixed(0)} km)' : ''}',
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

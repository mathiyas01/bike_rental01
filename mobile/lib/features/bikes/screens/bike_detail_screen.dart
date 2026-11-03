import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/bike_provider.dart';

class BikeDetailScreen extends ConsumerWidget {
  final String bikeId;

  const BikeDetailScreen({super.key, required this.bikeId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final bikeAsync = ref.watch(bikeDetailProvider(bikeId));

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        title: Text(l10n.commonDetails),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(bikeDetailProvider(bikeId)),
          ),
        ],
      ),
      body: bikeAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Text(
            err.toString(),
            style: const TextStyle(color: AppColors.danger),
          ),
        ),
        data: (bike) {
          return ListView(
            padding: const EdgeInsets.all(16.0),
            children: [
              // Header Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            bike.registrationNumber,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          StatusBadge(status: bike.status, label: bike.status),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${bike.make} ${bike.model} (${bike.yearOfManufacture})',
                        style: const TextStyle(
                          fontSize: 16,
                          color: AppColors.textDarkSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Divider(height: 24),
                      _DetailRow(label: 'VIN', value: bike.vin),
                      _DetailRow(
                        label: l10n.bikeOdometer,
                        value: '${bike.currentOdometer.toStringAsFixed(1)} km',
                      ),
                      _DetailRow(
                        label: l10n.bikeItp,
                        value: DateFormatter.formatDate(bike.itpExpiryDate),
                      ),
                      _DetailRow(
                        label: l10n.bikeRca,
                        value: DateFormatter.formatDate(bike.rcaExpiryDate),
                      ),
                      _DetailRow(
                        label: 'Service from',
                        value: '${bike.serviceIntervalDays} days',
                      ),
                      _DetailRow(
                        label: 'Next service',
                        value: DateFormatter.formatDate(
                          bike.nextServiceDueDate,
                        ),
                      ),
                      if (bike.notes != null)
                        _DetailRow(label: l10n.commonNotes, value: bike.notes!),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Quick Actions on this Bike
              Text(
                l10n.commonActions,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          context.push('/rentals/create?bikeId=${bike.id}'),
                      icon: const Icon(Icons.key),
                      label: Text(l10n.rentalCreate),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          context.push('/servicing/log?bikeId=${bike.id}'),
                      icon: const Icon(Icons.build),
                      label: Text(l10n.serviceLog),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => context.push('/reports/roi/${bike.id}'),
                icon: const Icon(Icons.analytics_outlined),
                label: Text(l10n.reportBikeRoi),
              ),
              const SizedBox(height: 16),

              // Archive Toggle
              Center(
                child: TextButton.icon(
                  onPressed: () async {
                    final confirm = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: Text(
                          bike.archived
                              ? l10n.commonUnarchive
                              : l10n.commonArchive,
                        ),
                        content: Text(
                          'Are you sure you want to change archive status for ${bike.registrationNumber}?',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, false),
                            child: Text(l10n.commonCancel),
                          ),
                          ElevatedButton(
                            onPressed: () => Navigator.pop(ctx, true),
                            child: Text(l10n.commonConfirm),
                          ),
                        ],
                      ),
                    );

                    if (confirm == true) {
                      final client = ref.read(apiClientProvider);
                      final endpoint = bike.archived
                          ? '${ApiEndpoints.bikes}/${bike.id}/unarchive'
                          : '${ApiEndpoints.bikes}/${bike.id}/archive';
                      await client.dio.post(endpoint);
                      ref.invalidate(bikeDetailProvider(bikeId));
                      ref.invalidate(bikesListProvider);
                    }
                  },
                  icon: Icon(
                    bike.archived ? Icons.unarchive : Icons.archive,
                    color: AppColors.neutral,
                  ),
                  label: Text(
                    bike.archived ? l10n.commonUnarchive : l10n.commonArchive,
                    style: const TextStyle(color: AppColors.neutral),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textDarkSecondary,
              fontSize: 13,
            ),
          ),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

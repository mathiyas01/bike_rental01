import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../l10n/app_localizations.dart';
import '../models/report_model.dart';
import '../providers/report_provider.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final reportState = ref.watch(reportProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.reportTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(reportProvider.notifier).loadReports(),
          ),
        ],
      ),
      body: reportState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () => ref.read(reportProvider.notifier).loadReports(),
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Section 1: Fleet Utilization
                    Text(
                      l10n.reportUtilization,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 12),
                    if (reportState.fleetUtilization != null)
                      _buildUtilizationCard(
                          context, reportState.fleetUtilization!, l10n),
                    const SizedBox(height: 24),

                    // Section 2: Bike Profitability (ROI)
                    Text(
                      l10n.reportBikeRoi,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 12),
                    if (reportState.bikeRois.isEmpty)
                      const EmptyState(
                        icon: Icons.analytics_outlined,
                        title: 'No Data Available',
                        subtitle:
                            'Bike profitability metrics will appear once rentals or maintenance are recorded.',
                      )
                    else
                      for (final roi in reportState.bikeRois) ...[
                        _buildBikeRoiCard(context, roi, l10n),
                        const SizedBox(height: 12),
                      ],
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildUtilizationCard(
      BuildContext context, FleetUtilization util, AppLocalizations l10n) {
    final theme = Theme.of(context);
    final ratePercent = util.utilizationRate.toStringAsFixed(1);

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: theme.colorScheme.outlineVariant.withAlpha(80),
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
                Text(
                  'Active Utilization Rate',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                Text(
                  '$ratePercent%',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: util.totalBikes > 0
                    ? util.rentedBikes / util.totalBikes
                    : 0.0,
                minHeight: 10,
                backgroundColor: theme.colorScheme.surfaceContainerHighest,
                valueColor: AlwaysStoppedAnimation<Color>(
                  theme.colorScheme.primary,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildUtilItem(
                  context,
                  util.totalBikes.toString(),
                  l10n.kpiFleetSize,
                  Colors.blueGrey,
                ),
                _buildUtilItem(
                  context,
                  util.rentedBikes.toString(),
                  l10n.statusRented,
                  Colors.blue,
                ),
                _buildUtilItem(
                  context,
                  util.availableBikes.toString(),
                  l10n.statusAvailable,
                  Colors.green,
                ),
                _buildUtilItem(
                  context,
                  util.inMaintenanceBikes.toString(),
                  l10n.statusInService,
                  Colors.orange,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUtilItem(
      BuildContext context, String count, String label, Color color) {
    return Column(
      children: [
        Text(
          count,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 11),
        ),
      ],
    );
  }

  Widget _buildBikeRoiCard(
      BuildContext context, BikeRoi roi, AppLocalizations l10n) {
    final theme = Theme.of(context);

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: theme.colorScheme.outlineVariant.withAlpha(80),
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
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    roi.registrationNumber,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ),
                Text(
                  roi.makeModel,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const Divider(height: 20),

            // Strict Currency Breakdown (RON, EUR, USD)
            for (final curr in ['RON', 'EUR', 'USD']) ...[
              if ((roi.totalRevenue[curr] ?? 0) > 0 ||
                  (roi.totalMaintenanceCost[curr] ?? 0) > 0) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        curr,
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      Row(
                        children: [
                          Text(
                            'Rev: ${CurrencyFormatter.format(roi.totalRevenue[curr] ?? 0, curr)}',
                            style: const TextStyle(
                                fontSize: 12, color: Colors.green),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Cost: ${CurrencyFormatter.format(roi.totalMaintenanceCost[curr] ?? 0, curr)}',
                            style: const TextStyle(
                                fontSize: 12, color: Colors.red),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Net: ${CurrencyFormatter.format(roi.netProfit[curr] ?? 0, curr)}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: (roi.netProfit[curr] ?? 0) >= 0
                                  ? Colors.green[800]
                                  : Colors.red[800],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ],

            if ((roi.totalRevenue['RON'] ?? 0) == 0 &&
                (roi.totalRevenue['EUR'] ?? 0) == 0 &&
                (roi.totalRevenue['USD'] ?? 0) == 0 &&
                (roi.totalMaintenanceCost['RON'] ?? 0) == 0 &&
                (roi.totalMaintenanceCost['EUR'] ?? 0) == 0 &&
                (roi.totalMaintenanceCost['USD'] ?? 0) == 0)
              Text(
                'No financial activity recorded yet for this bike.',
                style: theme.textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
              ),
          ],
        ),
      ),
    );
  }
}


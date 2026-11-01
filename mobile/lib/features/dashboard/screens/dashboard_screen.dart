import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/widgets/kpi_card.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/dashboard_provider.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final authState = ref.watch(authProvider);
    final dashboardAsync = ref.watch(dashboardDataProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.appTitle,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            if (authState.user != null)
              Text(
                '${authState.user!.fullName} (${authState.user!.role.replaceAll('ROLE_', '')})',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w400,
                  color: AppColors.textDarkSecondary,
                ),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.refresh(dashboardDataProvider),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: dashboardAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.cloud_off, size: 54, color: AppColors.danger),
                const SizedBox(height: 16),
                Text(
                  err.toString(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.textDarkSecondary),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => ref.refresh(dashboardDataProvider),
                  child: Text(l10n.commonFilter),
                ),
              ],
            ),
          ),
        ),
        data: (data) {
          final localeStr = authState.locale.languageCode;

          return RefreshIndicator(
            onRefresh: () async => ref.refresh(dashboardDataProvider),
            child: ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                // Fleet Utilization Banner
                Card(
                  color: AppColors.darkSurfaceLight.withValues(alpha: 0.35),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              l10n.reportUtilization,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              '${data.utilizationRate.toStringAsFixed(1)}%',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primaryLight,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: LinearProgressIndicator(
                            value: (data.utilizationRate / 100.0).clamp(0.0, 1.0),
                            minHeight: 10,
                            backgroundColor: AppColors.darkBorder,
                            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primaryLight),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              '${l10n.statusRented}: ${data.activeRentals}',
                              style: const TextStyle(fontSize: 12, color: AppColors.textDarkSecondary),
                            ),
                            Text(
                              '${l10n.statusAvailable}: ${data.availableBikes}',
                              style: const TextStyle(fontSize: 12, color: AppColors.success),
                            ),
                            Text(
                              '${l10n.statusInService}: ${data.inServiceBikes}',
                              style: const TextStyle(fontSize: 12, color: AppColors.warning),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Multi-Currency Monthly Revenue Card
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
                              l10n.kpiMonthlyRevenue,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Icon(Icons.account_balance_wallet_outlined, size: 20, color: AppColors.primaryLight),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          children: [
                            _RevenuePocket(
                              currency: 'RON',
                              amount: data.monthlyRevenue['RON'] ?? 0.0,
                              locale: localeStr,
                            ),
                            _RevenuePocket(
                              currency: 'EUR',
                              amount: data.monthlyRevenue['EUR'] ?? 0.0,
                              locale: localeStr,
                            ),
                            _RevenuePocket(
                              currency: 'USD',
                              amount: data.monthlyRevenue['USD'] ?? 0.0,
                              locale: localeStr,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Grid of KPI Metrics
                GridView.count(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    KpiCard(
                      title: l10n.kpiActiveRentals,
                      value: '${data.activeRentals}',
                      icon: Icons.key_outlined,
                      accentColor: AppColors.primaryLight,
                      onTap: () => context.go('/rentals'),
                    ),
                    KpiCard(
                      title: l10n.kpiAvailableBikes,
                      value: '${data.availableBikes}',
                      icon: Icons.two_wheeler_outlined,
                      accentColor: AppColors.success,
                      onTap: () => context.go('/bikes'),
                    ),
                    KpiCard(
                      title: l10n.kpiOverdueRent,
                      value: '${data.overdueCharges}',
                      icon: Icons.warning_amber_rounded,
                      accentColor: data.overdueCharges > 0 ? AppColors.danger : AppColors.neutral,
                      onTap: () => context.go('/rentals'),
                    ),
                    KpiCard(
                      title: l10n.kpiLowStockAlerts,
                      value: '${data.lowStockParts}',
                      icon: Icons.inventory_2_outlined,
                      accentColor: data.lowStockParts > 0 ? AppColors.warning : AppColors.neutral,
                      onTap: () => context.push('/inventory'),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Quick Navigation Actions
                Text(
                  l10n.commonActions,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/bikes/add'),
                        icon: const Icon(Icons.add, size: 18),
                        label: Text(l10n.bikeAdd),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => context.push('/rentals/create'),
                        icon: const Icon(Icons.note_add_outlined, size: 18),
                        label: Text(l10n.rentalCreate),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/payments/record'),
                        icon: const Icon(Icons.payment, size: 18),
                        label: Text(l10n.paymentRecord),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/servicing/log'),
                        icon: const Icon(Icons.build_outlined, size: 18),
                        label: Text(l10n.serviceLog),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _RevenuePocket extends StatelessWidget {
  final String currency;
  final double amount;
  final String locale;

  const _RevenuePocket({
    required this.currency,
    required this.amount,
    required this.locale,
  });

  @override
  Widget build(BuildContext context) {
    final color = CurrencyFormatter.getCurrencyColor(currency);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            currency,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            CurrencyFormatter.format(amount, currency, locale: locale),
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/customer_model.dart';
import '../providers/customer_provider.dart';

class CustomerDetailScreen extends ConsumerWidget {
  final String customerId;

  const CustomerDetailScreen({super.key, required this.customerId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final customerAsync = ref.watch(customerDetailProvider(customerId));
    final balanceAsync = ref.watch(customerBalanceProvider(customerId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.customerTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(customerDetailProvider(customerId));
              ref.invalidate(customerBalanceProvider(customerId));
            },
          ),
        ],
      ),
      body: customerAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text(err.toString(), style: const TextStyle(color: AppColors.danger))),
        data: (customer) {
          return ListView(
            padding: const EdgeInsets.all(16.0),
            children: [
              // Profile Summary Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 24,
                            backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                            child: Text(
                              customer.fullName.isNotEmpty ? customer.fullName[0].toUpperCase() : '?',
                              style: const TextStyle(fontSize: 20, color: AppColors.primaryLight, fontWeight: FontWeight.bold),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  customer.fullName,
                                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                                ),
                                Text(
                                  customer.phone,
                                  style: const TextStyle(fontSize: 14, color: AppColors.textDarkSecondary),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      _DetailItem(label: 'Email', value: customer.email ?? '-'),
                      _DetailItem(label: l10n.customerCnp, value: customer.cnpOrTaxId ?? '-'),
                      _DetailItem(label: l10n.customerLicence, value: customer.drivingLicenceNumber ?? '-'),
                      _DetailItem(label: l10n.customerLicenceCat, value: customer.licenceCategories ?? '-'),
                      _DetailItem(label: l10n.customerLicenceExpiry, value: DateFormatter.formatDate(customer.licenceExpiryDate)),
                      _DetailItem(label: l10n.customerAddress, value: customer.address ?? '-'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Multi-Currency Balance Summary
              Text(
                l10n.customerBalance,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),

              balanceAsync.when(
                loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
                error: (err, _) => Text(err.toString(), style: const TextStyle(color: AppColors.danger)),
                data: (balanceSummary) {
                  return Column(
                    children: [
                      _CurrencyBalanceCard(currency: 'RON', item: balanceSummary.balances['RON']),
                      _CurrencyBalanceCard(currency: 'EUR', item: balanceSummary.balances['EUR']),
                      _CurrencyBalanceCard(currency: 'USD', item: balanceSummary.balances['USD']),
                    ],
                  );
                },
              ),
              const SizedBox(height: 20),

              // Quick Actions
              Text(l10n.commonActions, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => context.push('/rentals/create?customerId=${customer.id}'),
                      icon: const Icon(Icons.note_add_outlined),
                      label: Text(l10n.rentalCreate),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => context.push('/payments/record?customerId=${customer.id}'),
                      icon: const Icon(Icons.payment),
                      label: Text(l10n.paymentRecord),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Archive Button
              Center(
                child: TextButton.icon(
                  onPressed: () async {
                    final confirm = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: Text(customer.archived ? l10n.commonUnarchive : l10n.commonArchive),
                        content: Text('Are you sure you want to change archive status for ${customer.fullName}?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l10n.commonCancel)),
                          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l10n.commonConfirm)),
                        ],
                      ),
                    );

                    if (confirm == true) {
                      final client = ref.read(apiClientProvider);
                      final endpoint = customer.archived
                          ? '${ApiEndpoints.customers}/${customer.id}/unarchive'
                          : '${ApiEndpoints.customers}/${customer.id}/archive';
                      await client.dio.post(endpoint);
                      ref.invalidate(customerDetailProvider(customerId));
                      ref.invalidate(customersListProvider);
                    }
                  },
                  icon: Icon(customer.archived ? Icons.unarchive : Icons.archive, color: AppColors.neutral),
                  label: Text(
                    customer.archived ? l10n.commonUnarchive : l10n.commonArchive,
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

class _DetailItem extends StatelessWidget {
  final String label;
  final String value;

  const _DetailItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textDarkSecondary, fontSize: 13)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }
}

class _CurrencyBalanceCard extends StatelessWidget {
  final String currency;
  final CustomerBalanceItem? item;

  const _CurrencyBalanceCard({required this.currency, required this.item});

  @override
  Widget build(BuildContext context) {
    final billed = item?.totalBilled ?? 0.0;
    final paid = item?.totalPaid ?? 0.0;
    final outstanding = item?.totalOutstanding ?? 0.0;
    final color = CurrencyFormatter.getCurrencyColor(currency);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                currency,
                style: TextStyle(fontWeight: FontWeight.w800, color: color),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Billed', style: TextStyle(fontSize: 11, color: AppColors.textDarkSecondary)),
                      Text(CurrencyFormatter.format(billed, currency), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Paid', style: TextStyle(fontSize: 11, color: AppColors.textDarkSecondary)),
                      Text(CurrencyFormatter.format(paid, currency), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Due', style: TextStyle(fontSize: 11, color: AppColors.textDarkSecondary)),
                      Text(
                        CurrencyFormatter.format(outstanding, currency),
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          color: outstanding > 0 ? AppColors.danger : AppColors.success,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

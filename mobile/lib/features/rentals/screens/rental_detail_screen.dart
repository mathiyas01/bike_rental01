import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../../bikes/providers/bike_provider.dart';
import '../providers/rental_provider.dart';

class RentalDetailScreen extends ConsumerWidget {
  final String rentalId;

  const RentalDetailScreen({super.key, required this.rentalId});

  Future<void> _generateNextCharge(BuildContext context, WidgetRef ref) async {
    final client = ref.read(apiClientProvider);
    try {
      await client.dio.post('${ApiEndpoints.rentalCharges}/rental/$rentalId/generate-next');
      ref.invalidate(rentalChargesProvider(rentalId));
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Next weekly charge generated'), backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
        );
      }
    }
  }

  Future<void> _closeRental(BuildContext context, WidgetRef ref) async {
    final notesController = TextEditingController();
    DateTime returnDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Close Rental Contract'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Closing the contract will restore the motorbike to AVAILABLE status.'),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Return Date'),
                subtitle: Text(DateFormatter.formatDate(returnDate)),
                trailing: OutlinedButton(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: returnDate,
                      firstDate: DateTime(2024),
                      lastDate: DateTime(2030),
                    );
                    if (picked != null) setState(() => returnDate = picked);
                  },
                  child: const Text('Change'),
                ),
              ),
              TextField(
                controller: notesController,
                decoration: const InputDecoration(labelText: 'Closure notes / inspection summary'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirm Close')),
          ],
        ),
      ),
    );

    if (confirmed == true && context.mounted) {
      final client = ref.read(apiClientProvider);
      try {
        await client.dio.post(
          '${ApiEndpoints.rentals}/$rentalId/close',
          data: {
            'closureDate': DateFormatter.formatDate(returnDate),
            'notes': notesController.text.trim().isEmpty ? null : notesController.text.trim(),
          },
        );
        ref.invalidate(rentalDetailProvider(rentalId));
        ref.invalidate(rentalsListProvider);
        ref.invalidate(bikesListProvider);

        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Contract closed and bike returned to fleet'), backgroundColor: AppColors.success),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final rentalAsync = ref.watch(rentalDetailProvider(rentalId));
    final chargesAsync = ref.watch(rentalChargesProvider(rentalId));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.rentalTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(rentalDetailProvider(rentalId));
              ref.invalidate(rentalChargesProvider(rentalId));
            },
          ),
        ],
      ),
      body: rentalAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text(err.toString(), style: const TextStyle(color: AppColors.danger))),
        data: (rental) {
          final isActive = rental.status == 'ACTIVE';

          return ListView(
            padding: const EdgeInsets.all(16.0),
            children: [
              // Contract Summary Card
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
                            rental.bikeRegistrationNumber,
                            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                          ),
                          StatusBadge(status: rental.status, label: rental.status),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Customer: ${rental.customerName}',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                      Text(
                        'Motorbike: ${rental.bikeMakeModel}',
                        style: const TextStyle(fontSize: 13, color: AppColors.textDarkSecondary),
                      ),
                      const Divider(height: 20),
                      _Row(label: l10n.rentalStartDate, value: DateFormatter.formatDate(rental.startDate)),
                      _Row(
                        label: l10n.rentalWeeklyRate,
                        value: CurrencyFormatter.format(rental.weeklyRate, rental.currency),
                      ),
                      _Row(
                        label: l10n.rentalDeposit,
                        value: CurrencyFormatter.format(rental.depositAmount, rental.depositCurrency),
                      ),
                      if (rental.actualClosedDate != null)
                        _Row(label: l10n.rentalClosureDate, value: DateFormatter.formatDate(rental.actualClosedDate)),
                      if (rental.termsAndNotes != null)
                        _Row(label: l10n.commonNotes, value: rental.termsAndNotes!),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Action Buttons
              if (isActive) ...[
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _generateNextCharge(context, ref),
                        icon: const Icon(Icons.add_card, size: 18),
                        label: const Text('Add Next Week'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () => _closeRental(context, ref),
                        icon: const Icon(Icons.check_circle_outline, size: 18),
                        label: Text(l10n.rentalClose),
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  onPressed: () => context.push('/payments/record?rentalId=${rental.id}&customerId=${rental.customerId}'),
                  icon: const Icon(Icons.payment),
                  label: Text(l10n.paymentRecord),
                ),
                const SizedBox(height: 20),
              ],

              // Weekly Rent Charges Schedule
              Text(
                l10n.rentalCharges,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),

              chargesAsync.when(
                loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
                error: (e, _) => Text(e.toString()),
                data: (charges) {
                  if (charges.isEmpty) {
                    return const Text('No charges generated yet.');
                  }

                  return Column(
                    children: charges.map((charge) {
                      return Card(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        child: Padding(
                          padding: const EdgeInsets.all(12.0),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  '#${charge.chargeSequence}',
                                  style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primaryLight),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${DateFormatter.formatDate(charge.periodStartDate)} - ${DateFormatter.formatDate(charge.periodEndDate)}',
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      'Due: ${DateFormatter.formatDate(charge.dueDate)}  •  Paid: ${CurrencyFormatter.format(charge.paidAmount, charge.currency)}',
                                      style: const TextStyle(fontSize: 11, color: AppColors.textDarkSecondary),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    CurrencyFormatter.format(charge.amount, charge.currency),
                                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                                  ),
                                  const SizedBox(height: 4),
                                  StatusBadge(status: charge.status, label: charge.status),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;

  const _Row({required this.label, required this.value});

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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/payment_model.dart';
import '../providers/payment_provider.dart';

class PaymentListScreen extends ConsumerStatefulWidget {
  const PaymentListScreen({super.key});

  @override
  ConsumerState<PaymentListScreen> createState() => _PaymentListScreenState();
}

class _PaymentListScreenState extends ConsumerState<PaymentListScreen> {
  String? _selectedCurrency;
  String? _selectedStatus;

  void _showReverseDialog(Payment payment) {
    final l10n = AppLocalizations.of(context)!;
    final reasonController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.paymentReverse),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${payment.customerName} - ${CurrencyFormatter.format(payment.amount, payment.currency)}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: reasonController,
                decoration: InputDecoration(
                  labelText: l10n.paymentReverseReason,
                  hintText: 'e.g. Bank transfer bounced, duplicate entry',
                ),
                maxLines: 2,
                validator: (val) => (val == null || val.trim().isEmpty)
                    ? 'Reason is required'
                    : null,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              if (formKey.currentState!.validate()) {
                Navigator.pop(ctx);
                final success = await ref
                    .read(paymentProvider.notifier)
                    .reversePayment(payment.id, reasonController.text.trim());
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        success ? l10n.commonSuccess : l10n.commonError,
                      ),
                    ),
                  );
                }
              }
            },
            child: Text(l10n.commonConfirm),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final paymentState = ref.watch(paymentProvider);
    final selectedCurrency = ref.watch(authProvider).currency;

    if (_selectedCurrency == null && paymentState.filterCurrency == null) {
      _selectedCurrency = selectedCurrency;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          ref
              .read(paymentProvider.notifier)
              .setFilter(currency: selectedCurrency, status: _selectedStatus);
        }
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.paymentTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(paymentProvider.notifier).loadPayments(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/payments/record'),
        icon: const Icon(Icons.add),
        label: Text(l10n.paymentRecord),
      ),
      body: Column(
        children: [
          // Filter Chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                FilterChip(
                  label: const Text('All Currencies'),
                  selected: _selectedCurrency == null,
                  onSelected: (_) {
                    setState(() => _selectedCurrency = null);
                    ref
                        .read(paymentProvider.notifier)
                        .setFilter(currency: null, status: _selectedStatus);
                  },
                ),
                const SizedBox(width: 8),
                for (final curr in ['RON', 'EUR', 'USD']) ...[
                  FilterChip(
                    label: Text(curr),
                    selected: _selectedCurrency == curr,
                    onSelected: (_) {
                      setState(() => _selectedCurrency = curr);
                      ref
                          .read(paymentProvider.notifier)
                          .setFilter(currency: curr, status: _selectedStatus);
                    },
                  ),
                  const SizedBox(width: 8),
                ],
                const VerticalDivider(width: 16),
                FilterChip(
                  label: const Text('All Statuses'),
                  selected: _selectedStatus == null,
                  onSelected: (_) {
                    setState(() => _selectedStatus = null);
                    ref
                        .read(paymentProvider.notifier)
                        .setFilter(currency: _selectedCurrency, status: null);
                  },
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.statusConfirmed),
                  selected: _selectedStatus == 'CONFIRMED',
                  onSelected: (_) {
                    setState(() => _selectedStatus = 'CONFIRMED');
                    ref
                        .read(paymentProvider.notifier)
                        .setFilter(
                          currency: _selectedCurrency,
                          status: 'CONFIRMED',
                        );
                  },
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.statusReversed),
                  selected: _selectedStatus == 'REVERSED',
                  onSelected: (_) {
                    setState(() => _selectedStatus = 'REVERSED');
                    ref
                        .read(paymentProvider.notifier)
                        .setFilter(
                          currency: _selectedCurrency,
                          status: 'REVERSED',
                        );
                  },
                ),
              ],
            ),
          ),

          // Content
          Expanded(
            child: paymentState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : paymentState.payments.isEmpty
                ? const EmptyState(
                    icon: Icons.payments_outlined,
                    title: 'No Payments Recorded',
                    subtitle: 'Log customer cash or bank receipts.',
                  )
                : RefreshIndicator(
                    onRefresh: () =>
                        ref.read(paymentProvider.notifier).loadPayments(),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: paymentState.payments.length,
                      separatorBuilder: (_, index) =>
                          const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final payment = paymentState.payments[index];
                        return _buildPaymentCard(context, payment, l10n);
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentCard(
    BuildContext context,
    Payment payment,
    AppLocalizations l10n,
  ) {
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
                Text(
                  CurrencyFormatter.format(payment.amount, payment.currency),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: payment.isReversed
                        ? Colors.grey
                        : Theme.of(context).colorScheme.primary,
                    decoration: payment.isReversed
                        ? TextDecoration.lineThrough
                        : null,
                  ),
                ),
                StatusBadge(status: payment.status),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.person_outline, size: 16, color: Colors.grey),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    payment.customerName,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  DateFormatter.formatDate(payment.paymentDate),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.blueGrey.withAlpha(30),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    payment.paymentMethod,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (payment.referenceNumber != null &&
                    payment.referenceNumber!.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Text(
                    'Ref: ${payment.referenceNumber}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
            if (payment.allocations.isNotEmpty) ...[
              const Divider(height: 20),
              Text(
                'Allocated across ${payment.allocations.length} weekly charge(s):',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              for (final alloc in payment.allocations)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Week #${alloc.sequenceNumber}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      Text(
                        CurrencyFormatter.format(
                          alloc.allocatedAmount,
                          payment.currency,
                        ),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
            if (payment.isReversed) ...[
              const Divider(height: 20),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.withAlpha(20),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Reversed',
                      style: TextStyle(
                        color: Colors.red,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                    if (payment.reversalReason != null)
                      Text(
                        'Reason: ${payment.reversalReason}',
                        style: const TextStyle(fontSize: 12),
                      ),
                  ],
                ),
              ),
            ] else ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  icon: const Icon(Icons.undo, size: 16, color: Colors.red),
                  label: Text(
                    l10n.paymentReverse,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                  onPressed: () => _showReverseDialog(payment),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

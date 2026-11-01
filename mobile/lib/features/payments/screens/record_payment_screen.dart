import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../l10n/app_localizations.dart';
import '../../customers/providers/customer_provider.dart';
import '../providers/payment_provider.dart';

class RecordPaymentScreen extends ConsumerStatefulWidget {
  final String? preselectedCustomerId;
  final String? preselectedRentalId;

  const RecordPaymentScreen({
    super.key,
    this.preselectedCustomerId,
    this.preselectedRentalId,
  });

  @override
  ConsumerState<RecordPaymentScreen> createState() =>
      _RecordPaymentScreenState();
}

class _RecordPaymentScreenState extends ConsumerState<RecordPaymentScreen> {
  final _formKey = GlobalKey<FormState>();

  String? _selectedCustomerId;
  final _amountController = TextEditingController();
  String _selectedCurrency = 'RON';
  String _selectedPaymentMethod = 'CASH';
  DateTime _paymentDate = DateTime.now();
  final _referenceController = TextEditingController();
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _selectedCustomerId = widget.preselectedCustomerId;
  }

  @override
  void dispose() {
    _amountController.dispose();
    _referenceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCustomerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a customer')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final payload = {
      'customerId': _selectedCustomerId,
      if (widget.preselectedRentalId != null)
        'rentalId': widget.preselectedRentalId,
      'paymentDate': DateFormat('yyyy-MM-dd').format(_paymentDate),
      'amount': double.parse(_amountController.text.trim()),
      'currency': _selectedCurrency,
      'paymentMethod': _selectedPaymentMethod,
      if (_referenceController.text.trim().isNotEmpty)
        'referenceNumber': _referenceController.text.trim(),
      if (_notesController.text.trim().isNotEmpty)
        'notes': _notesController.text.trim(),
      'allocationMode': 'AUTO_FIFO',
    };

    final success =
        await ref.read(paymentProvider.notifier).recordPayment(payload);

    setState(() => _isSubmitting = false);

    if (mounted) {
      final l10n = AppLocalizations.of(context)!;
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.commonSuccess)),
        );
        context.pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ref.read(paymentProvider).error ?? l10n.commonError),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final customers = ref.watch(customersListProvider).valueOrNull ?? [];

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.paymentRecord),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Customer Picker
              DropdownButtonFormField<String>(
                initialValue: _selectedCustomerId,
                decoration: InputDecoration(
                  labelText: l10n.customerTitle,
                  prefixIcon: const Icon(Icons.person_outline),
                ),
                items: customers.map((c) {
                  return DropdownMenuItem(
                    value: c.id,
                    child: Text('${c.fullName} (${c.phone})'),
                  );
                }).toList(),
                onChanged: (val) {
                  setState(() => _selectedCustomerId = val);
                },
                validator: (val) =>
                    val == null ? 'Customer selection required' : null,
              ),
              const SizedBox(height: 16),

              // Currency Selector
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'RON', label: Text('RON')),
                  ButtonSegment(value: 'EUR', label: Text('EUR')),
                  ButtonSegment(value: 'USD', label: Text('USD')),
                ],
                selected: {_selectedCurrency},
                onSelectionChanged: (set) {
                  setState(() => _selectedCurrency = set.first);
                },
              ),
              const SizedBox(height: 16),

              // Amount
              TextFormField(
                controller: _amountController,
                decoration: InputDecoration(
                  labelText: '${l10n.commonAmount} ($_selectedCurrency)',
                  prefixIcon: const Icon(Icons.attach_money),
                ),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'Amount is required';
                  }
                  final numVal = double.tryParse(val.trim());
                  if (numVal == null || numVal <= 0) {
                    return 'Enter a valid positive number';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Payment Method Picker
              DropdownButtonFormField<String>(
                initialValue: _selectedPaymentMethod,
                decoration: InputDecoration(
                  labelText: l10n.paymentMethod,
                  prefixIcon: const Icon(Icons.payment_outlined),
                ),
                items: [
                  DropdownMenuItem(
                      value: 'CASH', child: Text(l10n.paymentMethodCash)),
                  DropdownMenuItem(
                      value: 'BANK_TRANSFER',
                      child: Text(l10n.paymentMethodBank)),
                  DropdownMenuItem(
                      value: 'CARD', child: Text(l10n.paymentMethodCard)),
                ],
                onChanged: (val) {
                  if (val != null) setState(() => _selectedPaymentMethod = val);
                },
              ),
              const SizedBox(height: 16),

              // Payment Date
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.calendar_today_outlined),
                title: Text(l10n.commonDate),
                subtitle: Text(DateFormatter.formatDate(_paymentDate)),
                trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _paymentDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime.now().add(const Duration(days: 30)),
                  );
                  if (picked != null) {
                    setState(() => _paymentDate = picked);
                  }
                },
              ),
              const Divider(height: 24),

              // Reference Number
              TextFormField(
                controller: _referenceController,
                decoration: InputDecoration(
                  labelText: l10n.paymentReference,
                  hintText: 'e.g. REC-9821 or Bank Statement Ref',
                  prefixIcon: const Icon(Icons.tag),
                ),
              ),
              const SizedBox(height: 16),

              // Allocation Notice
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.withAlpha(25),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.withAlpha(80)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.auto_awesome,
                        color: Colors.blue, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        l10n.paymentAutoFifo,
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Notes
              TextFormField(
                controller: _notesController,
                decoration: InputDecoration(
                  labelText: l10n.commonNotes,
                  prefixIcon: const Icon(Icons.note_alt_outlined),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 24),

              // Submit Button
              FilledButton(
                onPressed: _isSubmitting ? null : _submit,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: _isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        l10n.paymentRecord,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

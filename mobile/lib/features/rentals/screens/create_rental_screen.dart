import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../auth/providers/auth_provider.dart';
import '../../bikes/providers/bike_provider.dart';
import '../../customers/providers/customer_provider.dart';
import '../../customers/models/customer_model.dart';
import '../providers/rental_provider.dart';

class CreateRentalScreen extends ConsumerStatefulWidget {
  final String? initialCustomerId;
  final String? initialBikeId;

  const CreateRentalScreen({
    super.key,
    this.initialCustomerId,
    this.initialBikeId,
  });

  @override
  ConsumerState<CreateRentalScreen> createState() => _CreateRentalScreenState();
}

class _CreateRentalScreenState extends ConsumerState<CreateRentalScreen> {
  final _formKey = GlobalKey<FormState>();

  String? _selectedCustomerId;
  String? _selectedBikeId;
  DateTime _startDate = DateTime.now();
  DateTime? _plannedEndDate;
  final _rateController = TextEditingController(text: '350.00');
  String _currency = 'RON';
  final _depositController = TextEditingController(text: '500.00');
  String _depositCurrency = 'RON';
  final _notesController = TextEditingController(
    text: 'Helmet and chain lock included.',
  );
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _selectedCustomerId = widget.initialCustomerId;
    _selectedBikeId = widget.initialBikeId;
  }

  @override
  void dispose() {
    _rateController.dispose();
    _depositController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCustomerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a customer'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }
    if (_selectedBikeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select an available motorbike'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    final client = ref.read(apiClientProvider);

    try {
      final payload = {
        'customerId': _selectedCustomerId,
        'motorbikeId': _selectedBikeId,
        'startDate': DateFormatter.formatDate(_startDate),
        'plannedEndDate': _plannedEndDate != null
            ? DateFormatter.formatDate(_plannedEndDate)
            : null,
        'weeklyRate': double.parse(_rateController.text.trim()),
        'currency': _currency,
        'depositAmount': double.parse(_depositController.text.trim()),
        'depositCurrency': _depositCurrency,
        'paymentFrequency': 'WEEKLY',
        'scheduleAnchorDay': 'START_DAY',
        'termsAndNotes': _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      };

      await client.dio.post(ApiEndpoints.rentals, data: payload);

      ref.invalidate(rentalsListProvider);
      ref.invalidate(bikesListProvider);

      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Rental contract created & bike status set to RENTED',
            ),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString()),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final customersAsync = ref.watch(customersListProvider);
    final bikesAsync = ref.watch(bikesListProvider);

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        title: Text(l10n.rentalCreate),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Customer Picker
              customersAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text(e.toString()),
                data: (customers) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _selectedCustomerId,
                        decoration: InputDecoration(
                          labelText: '${l10n.customerTitle} *',
                          prefixIcon: const Icon(Icons.person_outline),
                        ),
                        items: customers.map((c) {
                          return DropdownMenuItem(
                            value: c.id,
                            child: Text(
                              '${c.fullName} (${c.phone})',
                              overflow: TextOverflow.ellipsis,
                            ),
                          );
                        }).toList(),
                        onChanged: (val) =>
                            setState(() => _selectedCustomerId = val),
                        validator: (v) =>
                            v == null ? 'Customer selection required' : null,
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final customer = await context.push<CustomerModel>(
                            '/customers/add?fromRental=true',
                          );
                          if (customer != null && mounted) {
                            setState(() => _selectedCustomerId = customer.id);
                          }
                        },
                        icon: const Icon(Icons.person_add_outlined),
                        label: const Text('Add new customer'),
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 14),

              // Motorbike Picker (only available)
              bikesAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text(e.toString()),
                data: (bikes) {
                  final availableBikes = bikes
                      .where(
                        (b) =>
                            b.status == 'AVAILABLE' ||
                            b.id == widget.initialBikeId,
                      )
                      .toList();
                  return DropdownButtonFormField<String>(
                    initialValue: _selectedBikeId,
                    decoration: InputDecoration(
                      labelText: '${l10n.navBikes} *',
                      prefixIcon: const Icon(Icons.two_wheeler_outlined),
                    ),
                    items: availableBikes.map((b) {
                      return DropdownMenuItem(
                        value: b.id,
                        child: Text(
                          '${b.registrationNumber} - ${b.make} ${b.model}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    }).toList(),
                    onChanged: (val) => setState(() => _selectedBikeId = val),
                    validator: (v) =>
                        v == null ? 'Motorbike selection required' : null,
                  );
                },
              ),
              const SizedBox(height: 14),

              // Start Date Picker
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.calendar_today_outlined,
                  color: AppColors.primaryLight,
                ),
                title: Text(l10n.rentalStartDate),
                subtitle: Text(DateFormatter.formatDate(_startDate)),
                trailing: OutlinedButton(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _startDate,
                      firstDate: DateTime(2024),
                      lastDate: DateTime(2030),
                    );
                    if (picked != null) setState(() => _startDate = picked);
                  },
                  child: const Text('Change'),
                ),
              ),
              const SizedBox(height: 14),

              // Weekly Rate & Currency
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: _rateController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: '${l10n.rentalWeeklyRate} *',
                        prefixIcon: const Icon(Icons.payments_outlined),
                      ),
                      validator: (v) => v == null || double.tryParse(v) == null
                          ? 'Invalid rate'
                          : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 1,
                    child: DropdownButtonFormField<String>(
                      initialValue: _currency,
                      decoration: InputDecoration(
                        labelText: l10n.commonCurrency,
                      ),
                      items: const [
                        DropdownMenuItem(value: 'RON', child: Text('RON')),
                        DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                        DropdownMenuItem(value: 'USD', child: Text('USD')),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _currency = val);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Deposit Amount & Currency
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: _depositController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: '${l10n.rentalDeposit} *',
                        prefixIcon: const Icon(Icons.shield_outlined),
                      ),
                      validator: (v) => v == null || double.tryParse(v) == null
                          ? 'Invalid deposit'
                          : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 1,
                    child: DropdownButtonFormField<String>(
                      initialValue: _depositCurrency,
                      decoration: const InputDecoration(
                        labelText: 'Deposit Curr',
                      ),
                      items: const [
                        DropdownMenuItem(value: 'RON', child: Text('RON')),
                        DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                        DropdownMenuItem(value: 'USD', child: Text('USD')),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _depositCurrency = val);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _notesController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: l10n.commonNotes,
                  hintText: 'Accessories, conditions, terms...',
                ),
              ),
              const SizedBox(height: 24),

              ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                child: _isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(l10n.rentalCreate),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

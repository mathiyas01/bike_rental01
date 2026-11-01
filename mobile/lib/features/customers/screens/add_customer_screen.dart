import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/customer_provider.dart';

class AddCustomerScreen extends ConsumerStatefulWidget {
  const AddCustomerScreen({super.key});

  @override
  ConsumerState<AddCustomerScreen> createState() => _AddCustomerScreenState();
}

class _AddCustomerScreenState extends ConsumerState<AddCustomerScreen> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController(text: '+40');
  final _emailController = TextEditingController();
  final _cnpController = TextEditingController();
  final _licenceController = TextEditingController();
  final _categoriesController = TextEditingController(text: 'A, B');
  final _addressController = TextEditingController();
  final _notesController = TextEditingController();

  DateTime? _licenceExpiry;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _cnpController.dispose();
    _licenceController.dispose();
    _categoriesController.dispose();
    _addressController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);
    final client = ref.read(apiClientProvider);

    try {
      final payload = {
        'fullName': _nameController.text.trim(),
        'phone': _phoneController.text.trim(),
        'email': _emailController.text.trim().isEmpty ? null : _emailController.text.trim(),
        'cnpOrTaxId': _cnpController.text.trim().isEmpty ? null : _cnpController.text.trim(),
        'drivingLicenceNumber': _licenceController.text.trim().isEmpty ? null : _licenceController.text.trim(),
        'licenceCategories': _categoriesController.text.trim().isEmpty ? null : _categoriesController.text.trim(),
        'licenceExpiryDate': _licenceExpiry != null ? DateFormatter.formatDate(_licenceExpiry) : null,
        'address': _addressController.text.trim().isEmpty ? null : _addressController.text.trim(),
        'notes': _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
      };

      await client.dio.post(ApiEndpoints.customers, data: payload);
      ref.invalidate(customersListProvider);

      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Customer registered successfully'), backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.customerAdd)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: InputDecoration(
                  labelText: '${l10n.customerName} *',
                  hintText: 'e.g. Andrei Vasilescu',
                  prefixIcon: const Icon(Icons.person_outline),
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: '${l10n.customerPhone} *',
                  hintText: '+40 721 234 567',
                  prefixIcon: const Icon(Icons.phone_outlined),
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  hintText: 'andrei@example.ro',
                  prefixIcon: Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _cnpController,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: l10n.customerCnp,
                  hintText: '13-digit Romanian CNP',
                  prefixIcon: const Icon(Icons.badge_outlined),
                ),
              ),
              const SizedBox(height: 20),

              // Driving Licence Group
              Text(
                'Driving Licence & Qualification',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
              const SizedBox(height: 10),

              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _licenceController,
                      decoration: InputDecoration(
                        labelText: l10n.customerLicence,
                        hintText: 'B00123456Z',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _categoriesController,
                      decoration: InputDecoration(
                        labelText: l10n.customerLicenceCat,
                        hintText: 'A, A2, B',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event, color: AppColors.primaryLight),
                title: Text(l10n.customerLicenceExpiry),
                subtitle: Text(_licenceExpiry != null ? DateFormatter.formatDate(_licenceExpiry) : 'Not set'),
                trailing: OutlinedButton(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now().add(const Duration(days: 365 * 5)),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2050),
                    );
                    if (picked != null) setState(() => _licenceExpiry = picked);
                  },
                  child: const Text('Set'),
                ),
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _addressController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: l10n.customerAddress,
                  hintText: 'Strada, Număr, Oraș, Județ',
                ),
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _notesController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: l10n.commonNotes,
                  hintText: 'Driver background, platform courier info...',
                ),
              ),
              const SizedBox(height: 24),

              ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                child: _isSubmitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.commonSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/bike_provider.dart';

class AddBikeScreen extends ConsumerStatefulWidget {
  const AddBikeScreen({super.key});

  @override
  ConsumerState<AddBikeScreen> createState() => _AddBikeScreenState();
}

class _AddBikeScreenState extends ConsumerState<AddBikeScreen> {
  final _formKey = GlobalKey<FormState>();

  final _plateController = TextEditingController();
  final _vinController = TextEditingController();
  final _makeController = TextEditingController(text: 'Honda');
  final _modelController = TextEditingController();
  final _yearController = TextEditingController(
    text: DateTime.now().year.toString(),
  );
  final _odometerController = TextEditingController(text: '0.0');
  final _notesController = TextEditingController();

  DateTime? _itpExpiry;
  DateTime? _rcaExpiry;
  DateTime? _cascoExpiry;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _plateController.dispose();
    _vinController.dispose();
    _makeController.dispose();
    _modelController.dispose();
    _yearController.dispose();
    _odometerController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickDate(
    BuildContext context,
    DateTime? initial,
    ValueChanged<DateTime> onPicked,
  ) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: initial ?? DateTime.now().plusYears(1),
      firstDate: DateTime(2020),
      lastDate: DateTime(2040),
    );
    if (picked != null) onPicked(picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);
    final client = ref.read(apiClientProvider);

    try {
      final payload = {
        'registrationNumber': _plateController.text.trim().toUpperCase(),
        'vin': _vinController.text.trim().toUpperCase(),
        'make': _makeController.text.trim(),
        'model': _modelController.text.trim(),
        'yearOfManufacture': int.parse(_yearController.text.trim()),
        'currentOdometer': double.parse(_odometerController.text.trim()),
        'itpExpiryDate': _itpExpiry != null
            ? DateFormatter.formatDate(_itpExpiry)
            : null,
        'rcaExpiryDate': _rcaExpiry != null
            ? DateFormatter.formatDate(_rcaExpiry)
            : null,
        'cascoExpiryDate': _cascoExpiry != null
            ? DateFormatter.formatDate(_cascoExpiry)
            : null,
        'status': 'AVAILABLE',
        'notes': _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      };

      await client.dio.post(ApiEndpoints.bikes, data: payload);
      ref.invalidate(bikesListProvider);

      if (mounted) {
        context.pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Motorbike added successfully'),
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

    return Scaffold(
      appBar: AppBar(leading: const AppBackButton(), title: Text(l10n.bikeAdd)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _plateController,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  labelText: '${l10n.bikePlate} *',
                  hintText: 'e.g. B 123 BIK',
                  prefixIcon: const Icon(Icons.badge_outlined),
                ),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _vinController,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  labelText: '${l10n.bikeVin} *',
                  hintText: '17 character frame code',
                  prefixIcon: const Icon(Icons.fingerprint),
                ),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 14),

              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _makeController,
                      decoration: InputDecoration(
                        labelText: '${l10n.bikeMake} *',
                        hintText: 'Honda, Yamaha, etc.',
                      ),
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? 'Required' : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _modelController,
                      decoration: InputDecoration(
                        labelText: '${l10n.bikeModel} *',
                        hintText: 'PCX 125, NMAX, etc.',
                      ),
                      validator: (v) =>
                          v == null || v.trim().isEmpty ? 'Required' : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _yearController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: '${l10n.bikeYear} *',
                      ),
                      validator: (v) => v == null || int.tryParse(v) == null
                          ? 'Invalid year'
                          : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _odometerController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: '${l10n.bikeOdometer} *',
                      ),
                      validator: (v) => v == null || double.tryParse(v) == null
                          ? 'Invalid odometer'
                          : null,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Date Selectors for Compliance
              Text(
                'Regulatory Compliance & Insurance',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 8),

              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event, color: AppColors.primaryLight),
                title: Text(l10n.bikeItp),
                subtitle: Text(
                  _itpExpiry != null
                      ? DateFormatter.formatDate(_itpExpiry)
                      : 'Not set',
                ),
                trailing: OutlinedButton(
                  onPressed: () => _pickDate(
                    context,
                    _itpExpiry,
                    (d) => setState(() => _itpExpiry = d),
                  ),
                  child: const Text('Set'),
                ),
              ),

              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.shield_outlined,
                  color: AppColors.primaryLight,
                ),
                title: Text(l10n.bikeRca),
                subtitle: Text(
                  _rcaExpiry != null
                      ? DateFormatter.formatDate(_rcaExpiry)
                      : 'Not set',
                ),
                trailing: OutlinedButton(
                  onPressed: () => _pickDate(
                    context,
                    _rcaExpiry,
                    (d) => setState(() => _rcaExpiry = d),
                  ),
                  child: const Text('Set'),
                ),
              ),
              const SizedBox(height: 14),

              TextFormField(
                controller: _notesController,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: l10n.commonNotes,
                  hintText: 'Additional fleet notes...',
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
                    : Text(l10n.commonSave),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

extension on DateTime {
  DateTime plusYears(int years) => DateTime(year + years, month, day);
}

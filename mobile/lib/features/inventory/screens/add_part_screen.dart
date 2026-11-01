import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../l10n/app_localizations.dart';
import '../providers/inventory_provider.dart';

class AddPartScreen extends ConsumerStatefulWidget {
  const AddPartScreen({super.key});

  @override
  ConsumerState<AddPartScreen> createState() => _AddPartScreenState();
}

class _AddPartScreenState extends ConsumerState<AddPartScreen> {
  final _formKey = GlobalKey<FormState>();

  final _codeController = TextEditingController();
  final _nameController = TextEditingController();
  String _category = 'CONSUMABLE';
  final _descriptionController = TextEditingController();
  String _unitOfMeasure = 'PCS';
  final _initialQuantityController = TextEditingController(text: '0');
  final _minLevelController = TextEditingController(text: '2');
  final _unitCostController = TextEditingController(text: '0.00');
  String _costCurrency = 'RON';
  bool _isSubmitting = false;

  final List<String> _categories = [
    'CONSUMABLE',
    'ENGINE',
    'BRAKES',
    'TIRES',
    'SUSPENSION',
    'ELECTRICAL',
    'BODYWORK',
    'ACCESSORY',
    'GENERAL',
  ];

  final List<String> _units = [
    'PCS',
    'LITERS',
    'SETS',
    'METERS',
    'PAIRS',
  ];

  @override
  void dispose() {
    _codeController.dispose();
    _nameController.dispose();
    _descriptionController.dispose();
    _initialQuantityController.dispose();
    _minLevelController.dispose();
    _unitCostController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    final payload = {
      'partCode': _codeController.text.trim().toUpperCase(),
      'name': _nameController.text.trim(),
      'category': _category,
      if (_descriptionController.text.trim().isNotEmpty)
        'description': _descriptionController.text.trim(),
      'unitOfMeasure': _unitOfMeasure,
      'initialQuantity': double.parse(_initialQuantityController.text.trim()),
      'minReorderLevel': double.parse(_minLevelController.text.trim()),
      'defaultUnitCost': double.parse(_unitCostController.text.trim()),
      'costCurrency': _costCurrency,
    };

    final success =
        await ref.read(inventoryProvider.notifier).createPart(payload);

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
            content:
                Text(ref.read(inventoryProvider).error ?? l10n.commonError),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.inventoryPartAdd),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Part Code
              TextFormField(
                controller: _codeController,
                decoration: InputDecoration(
                  labelText: l10n.inventoryPartCode,
                  hintText: 'e.g. OIL-10W40, BRAKE-PAD-FRONT',
                  prefixIcon: const Icon(Icons.qr_code),
                ),
                textCapitalization: TextCapitalization.characters,
                validator: (val) =>
                    (val == null || val.trim().isEmpty) ? 'Part code required' : null,
              ),
              const SizedBox(height: 16),

              // Part Name
              TextFormField(
                controller: _nameController,
                decoration: InputDecoration(
                  labelText: l10n.inventoryPartName,
                  hintText: 'e.g. Motul 7100 10W40 4T (1L)',
                  prefixIcon: const Icon(Icons.label_outline),
                ),
                validator: (val) =>
                    (val == null || val.trim().isEmpty) ? 'Part name required' : null,
              ),
              const SizedBox(height: 16),

              // Category & Unit Row
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: InputDecoration(
                        labelText: l10n.inventoryCategory,
                      ),
                      items: _categories.map((c) {
                        return DropdownMenuItem(value: c, child: Text(c));
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) setState(() => _category = val);
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: DropdownButtonFormField<String>(
                      initialValue: _unitOfMeasure,
                      decoration: InputDecoration(
                        labelText: l10n.inventoryUnitMeasure,
                      ),
                      items: _units.map((u) {
                        return DropdownMenuItem(value: u, child: Text(u));
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) setState(() => _unitOfMeasure = val);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Initial Quantity & Min Reorder Level
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _initialQuantityController,
                      decoration: InputDecoration(
                        labelText: l10n.inventoryCurrentStock,
                        prefixIcon: const Icon(Icons.inventory),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'Required';
                        if (double.tryParse(val.trim()) == null) return 'Invalid';
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _minLevelController,
                      decoration: InputDecoration(
                        labelText: l10n.inventoryMinLevel,
                        prefixIcon: const Icon(Icons.warning_amber),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'Required';
                        if (double.tryParse(val.trim()) == null) return 'Invalid';
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Unit Cost and Currency
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: TextFormField(
                      controller: _unitCostController,
                      decoration: InputDecoration(
                        labelText: l10n.inventoryUnitCost,
                        prefixIcon: const Icon(Icons.attach_money),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'Required';
                        if (double.tryParse(val.trim()) == null) return 'Invalid';
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: DropdownButtonFormField<String>(
                      initialValue: _costCurrency,
                      decoration: InputDecoration(
                        labelText: l10n.commonCurrency,
                      ),
                      items: const [
                        DropdownMenuItem(value: 'RON', child: Text('RON')),
                        DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                        DropdownMenuItem(value: 'USD', child: Text('USD')),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _costCurrency = val);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Description
              TextFormField(
                controller: _descriptionController,
                decoration: const InputDecoration(
                  labelText: 'Description / Specifications',
                  prefixIcon: Icon(Icons.notes),
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
                        l10n.inventoryPartAdd,
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


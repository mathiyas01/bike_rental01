import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/utils/date_formatter.dart';
import '../../../l10n/app_localizations.dart';
import '../../bikes/providers/bike_provider.dart';
import '../../inventory/models/part_model.dart';
import '../../inventory/providers/inventory_provider.dart';
import '../providers/service_provider.dart';

class LogServiceScreen extends ConsumerStatefulWidget {
  final String? preselectedBikeId;

  const LogServiceScreen({super.key, this.preselectedBikeId});

  @override
  ConsumerState<LogServiceScreen> createState() => _LogServiceScreenState();
}

class _LogServiceScreenState extends ConsumerState<LogServiceScreen> {
  final _formKey = GlobalKey<FormState>();

  String? _selectedBikeId;
  DateTime _serviceDate = DateTime.now();
  final _odometerController = TextEditingController();
  final _providerController = TextEditingController();
  final _workController = TextEditingController();
  final _labourCostController = TextEditingController(text: '0');
  String _labourCurrency = 'RON';
  DateTime? _nextDueDate;
  final _nextDueOdometerController = TextEditingController();
  final _notesController = TextEditingController();
  final Map<String, double> _partQuantities = {};
  bool _isSubmitting = false;

  void _setDefaultNextDue(List bikes) {
    if (_selectedBikeId == null) return;
    final bike = bikes.cast<dynamic>().firstWhere(
      (element) => element.id == _selectedBikeId,
      orElse: () => null,
    );
    if (bike != null) {
      _nextDueDate = _serviceDate.add(Duration(days: bike.serviceIntervalDays));
    }
  }

  Future<void> _showAddPartsDialog(List<Part> availableParts) async {
    final selectableParts = availableParts
        .where((part) => !_partQuantities.containsKey(part.id))
        .toList();
    if (selectableParts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No additional parts are available in stock'),
        ),
      );
      return;
    }

    Part selectedPart = selectableParts.first;
    final quantityController = TextEditingController(text: '1');
    final formKey = GlobalKey<FormState>();

    final result = await showDialog<double>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add parts'),
          content: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<Part>(
                  initialValue: selectedPart,
                  decoration: const InputDecoration(labelText: 'Spare part'),
                  items: selectableParts
                      .map(
                        (part) => DropdownMenuItem(
                          value: part,
                          child: Text(
                            '${part.partCode} - ${part.name} '
                            '(${part.currentQuantity} ${part.unitOfMeasure} available)',
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (part) {
                    if (part != null) {
                      setDialogState(() => selectedPart = part);
                    }
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: quantityController,
                  decoration: InputDecoration(
                    labelText: 'Quantity (${selectedPart.unitOfMeasure})',
                    helperText:
                        'Available: ${selectedPart.currentQuantity} ${selectedPart.unitOfMeasure}',
                  ),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  validator: (value) {
                    final quantity = double.tryParse(value?.trim() ?? '');
                    if (quantity == null || quantity <= 0) {
                      return 'Enter a quantity greater than 0';
                    }
                    if (quantity > selectedPart.currentQuantity) {
                      return 'Quantity exceeds available stock';
                    }
                    return null;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (formKey.currentState!.validate()) {
                  Navigator.pop(
                    dialogContext,
                    double.parse(quantityController.text.trim()),
                  );
                }
              },
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
    quantityController.dispose();

    if (result != null && mounted) {
      setState(() => _partQuantities[selectedPart.id] = result);
    }
  }

  @override
  void initState() {
    super.initState();
    _selectedBikeId = widget.preselectedBikeId;
  }

  @override
  void dispose() {
    _odometerController.dispose();
    _providerController.dispose();
    _workController.dispose();
    _labourCostController.dispose();
    _nextDueOdometerController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedBikeId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a motorbike')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final payload = {
      'motorbikeId': _selectedBikeId,
      'serviceDate': DateFormat('yyyy-MM-dd').format(_serviceDate),
      'odometerReading': double.parse(_odometerController.text.trim()),
      'serviceProvider': _providerController.text.trim(),
      'workPerformed': _workController.text.trim(),
      'labourCost': double.parse(_labourCostController.text.trim()),
      'labourCurrency': _labourCurrency,
      'status': 'COMPLETED',
      if (_nextDueDate != null)
        'nextServiceDueDate': DateFormat('yyyy-MM-dd').format(_nextDueDate!),
      if (_nextDueOdometerController.text.trim().isNotEmpty)
        'nextServiceDueOdometer': double.parse(
          _nextDueOdometerController.text.trim(),
        ),
      if (_notesController.text.trim().isNotEmpty)
        'notes': _notesController.text.trim(),
      'partsUsed': _partQuantities.entries.map((entry) {
        final part = ref
            .read(inventoryProvider)
            .parts
            .firstWhere((item) => item.id == entry.key);
        return {
          'partId': part.id,
          'quantity': entry.value,
          'unitCost': part.defaultUnitCost,
          'currency': part.costCurrency,
        };
      }).toList(),
    };

    final success = await ref
        .read(serviceProvider.notifier)
        .logService(payload);

    setState(() => _isSubmitting = false);

    if (mounted) {
      final l10n = AppLocalizations.of(context)!;
      if (success) {
        ref.invalidate(bikesListProvider);
        await ref.read(inventoryProvider.notifier).loadParts();
        if (!mounted) return;
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(l10n.commonSuccess)));
        context.pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ref.read(serviceProvider).error ?? l10n.commonError),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final bikes = ref.watch(bikesListProvider).valueOrNull ?? [];
    final inventoryState = ref.watch(inventoryProvider);
    final availableParts = inventoryState.parts
        .where((part) => part.active && part.currentQuantity > 0)
        .toList();

    return Scaffold(
      appBar: AppBar(title: Text(l10n.serviceLog)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Bike selector
              DropdownButtonFormField<String>(
                initialValue: _selectedBikeId,
                decoration: InputDecoration(
                  labelText: l10n.bikeTitle,
                  prefixIcon: const Icon(Icons.two_wheeler_outlined),
                ),
                items: bikes.map((b) {
                  return DropdownMenuItem(
                    value: b.id,
                    child: Text(
                      '${b.registrationNumber} (${b.make} ${b.model})',
                    ),
                  );
                }).toList(),
                onChanged: (val) {
                  setState(() {
                    _selectedBikeId = val;
                    final bike = bikes.firstWhere(
                      (element) => element.id == val,
                    );
                    _odometerController.text = bike.currentOdometer
                        .toStringAsFixed(0);
                    _nextDueDate = _serviceDate.add(
                      Duration(days: bike.serviceIntervalDays),
                    );
                  });
                },
                validator: (val) =>
                    val == null ? 'Motorbike selection required' : null,
              ),
              const SizedBox(height: 16),

              // Service Date
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.calendar_today_outlined),
                title: Text(l10n.commonDate),
                subtitle: Text(DateFormatter.formatDate(_serviceDate)),
                trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _serviceDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime.now().add(const Duration(days: 30)),
                  );
                  if (picked != null) {
                    setState(() {
                      _serviceDate = picked;
                      _setDefaultNextDue(bikes);
                    });
                  }
                },
              ),
              const SizedBox(height: 16),

              // Current Odometer
              TextFormField(
                controller: _odometerController,
                decoration: InputDecoration(
                  labelText: l10n.bikeOdometer,
                  prefixIcon: const Icon(Icons.speed),
                  suffixText: 'km',
                ),
                keyboardType: TextInputType.number,
                validator: (val) {
                  if (val == null || val.trim().isEmpty) {
                    return 'Odometer reading is required';
                  }
                  final numVal = double.tryParse(val.trim());
                  if (numVal == null || numVal < 0) {
                    return 'Enter valid odometer reading';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Parts used
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Add parts',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: inventoryState.isLoading
                        ? null
                        : () => _showAddPartsDialog(availableParts),
                    icon: const Icon(Icons.add),
                    label: const Text('Add parts'),
                  ),
                ],
              ),
              if (inventoryState.error != null)
                Text(
                  inventoryState.error!,
                  style: const TextStyle(color: Colors.red),
                ),
              if (_partQuantities.isNotEmpty)
                ..._partQuantities.entries.map((entry) {
                  final part = inventoryState.parts.firstWhere(
                    (item) => item.id == entry.key,
                  );
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.inventory_2_outlined),
                    title: Text('${part.partCode} - ${part.name}'),
                    subtitle: Text(
                      '${entry.value} ${part.unitOfMeasure} '
                      '(stock: ${part.currentQuantity} ${part.unitOfMeasure})',
                    ),
                    trailing: IconButton(
                      tooltip: 'Remove part',
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () =>
                          setState(() => _partQuantities.remove(entry.key)),
                    ),
                  );
                }),
              const SizedBox(height: 16),

              // Provider
              TextFormField(
                controller: _providerController,
                decoration: InputDecoration(
                  labelText: l10n.serviceProvider,
                  hintText: 'e.g. MotoGaraj SRL / In-house Workshop',
                  prefixIcon: const Icon(Icons.store_outlined),
                ),
                validator: (val) => (val == null || val.trim().isEmpty)
                    ? 'Service provider is required'
                    : null,
              ),
              const SizedBox(height: 16),

              // Work Performed
              TextFormField(
                controller: _workController,
                decoration: InputDecoration(
                  labelText: l10n.serviceWork,
                  hintText:
                      'e.g. 10,000 km revision, oil filter changed, chain adjusted',
                  prefixIcon: const Icon(Icons.build_circle_outlined),
                ),
                maxLines: 3,
                validator: (val) => (val == null || val.trim().isEmpty)
                    ? 'Work performed description is required'
                    : null,
              ),
              const SizedBox(height: 16),

              // Labour Cost and Currency
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: _labourCostController,
                      decoration: InputDecoration(
                        labelText: l10n.serviceLabour,
                        prefixIcon: const Icon(Icons.attach_money),
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'Cost required';
                        }
                        if (double.tryParse(val.trim()) == null) {
                          return 'Invalid number';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 1,
                    child: DropdownButtonFormField<String>(
                      initialValue: _labourCurrency,
                      decoration: InputDecoration(
                        labelText: l10n.commonCurrency,
                      ),
                      items: const [
                        DropdownMenuItem(value: 'RON', child: Text('RON')),
                        DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                        DropdownMenuItem(value: 'USD', child: Text('USD')),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _labourCurrency = val);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Next Service Due Date
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.alarm_outlined),
                title: Text(l10n.serviceNextDue),
                subtitle: Text(
                  _nextDueDate != null
                      ? DateFormatter.formatDate(_nextDueDate)
                      : 'Not specified',
                ),
                trailing: TextButton(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: DateTime.now().add(const Duration(days: 90)),
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 730)),
                    );
                    if (picked != null) {
                      setState(() => _nextDueDate = picked);
                    }
                  },
                  child: const Text('Pick Date'),
                ),
              ),
              const SizedBox(height: 8),

              // Next Due Odometer
              TextFormField(
                controller: _nextDueOdometerController,
                decoration: const InputDecoration(
                  labelText: 'Next Due Odometer (km)',
                  prefixIcon: Icon(Icons.timeline),
                  suffixText: 'km',
                ),
                keyboardType: TextInputType.number,
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
                        l10n.serviceLog,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

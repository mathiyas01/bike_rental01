import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/app_back_button.dart';
import '../../../l10n/app_localizations.dart';
import '../models/part_model.dart';
import '../providers/inventory_provider.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _searchController = TextEditingController();
  bool _lowStockOnly = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showStockMovementDialog(Part part) {
    final l10n = AppLocalizations.of(context)!;
    final qtyController = TextEditingController();
    final costController = TextEditingController(
      text: part.defaultUnitCost > 0
          ? part.defaultUnitCost.toStringAsFixed(2)
          : '',
    );
    final reasonController = TextEditingController();
    String movementType = 'PURCHASE'; // PURCHASE, USAGE_NON_SERVICE, ADJUSTMENT
    final formKey = GlobalKey<FormState>();

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(l10n.inventoryStockMove),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${part.partCode} - ${part.name}',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'Current Stock: ${part.currentQuantity.toStringAsFixed(0)} ${part.unitOfMeasure}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: movementType,
                    decoration: const InputDecoration(
                      labelText: 'Movement Type',
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'PURCHASE',
                        child: Text('Stock In (Purchase)'),
                      ),
                      DropdownMenuItem(
                        value: 'USAGE_NON_SERVICE',
                        child: Text('Stock Out (Non-Service)'),
                      ),
                      DropdownMenuItem(
                        value: 'ADJUSTMENT',
                        child: Text('Manual Adjustment'),
                      ),
                    ],
                    onChanged: (val) {
                      if (val != null) setDialogState(() => movementType = val);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: qtyController,
                    decoration: InputDecoration(
                      labelText: 'Quantity (${part.unitOfMeasure})',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    validator: (val) {
                      if (val == null || val.trim().isEmpty) {
                        return 'Quantity required';
                      }
                      final num = double.tryParse(val.trim());
                      if (num == null || num <= 0) {
                        return 'Quantity must be > 0';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  if (movementType == 'PURCHASE') ...[
                    TextFormField(
                      controller: costController,
                      decoration: InputDecoration(
                        labelText: 'Unit Cost (${part.costCurrency})',
                      ),
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    controller: reasonController,
                    decoration: const InputDecoration(
                      labelText: 'Reason / Supplier / Note',
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () async {
                if (formKey.currentState!.validate()) {
                  Navigator.pop(ctx);
                  final payload = {
                    'partId': part.id,
                    'quantity': double.parse(qtyController.text.trim()),
                    'movementType': movementType,
                    if (costController.text.trim().isNotEmpty)
                      'unitCost': double.parse(costController.text.trim()),
                    'currency': part.costCurrency,
                    if (reasonController.text.trim().isNotEmpty)
                      'reason': reasonController.text.trim(),
                  };
                  final messenger = ScaffoldMessenger.of(context);
                  final success = await ref
                      .read(inventoryProvider.notifier)
                      .recordStockMovement(payload);
                  if (mounted) {
                    messenger.showSnackBar(
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
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final inventoryState = ref.watch(inventoryProvider);

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        title: Text(l10n.inventoryTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(inventoryProvider.notifier).loadParts(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/inventory/add'),
        icon: const Icon(Icons.add),
        label: Text(l10n.inventoryPartAdd),
      ),
      body: Column(
        children: [
          // Search & Filter
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: l10n.commonSearch,
                      prefixIcon: const Icon(Icons.search),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onSubmitted: (val) {
                      ref
                          .read(inventoryProvider.notifier)
                          .setFilter(
                            search: val.trim(),
                            lowStockOnly: _lowStockOnly,
                          );
                    },
                  ),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.kpiLowStockAlerts),
                  selected: _lowStockOnly,
                  avatar: Icon(
                    Icons.warning_amber_rounded,
                    size: 16,
                    color: _lowStockOnly ? Colors.white : Colors.amber,
                  ),
                  onSelected: (selected) {
                    setState(() => _lowStockOnly = selected);
                    ref
                        .read(inventoryProvider.notifier)
                        .setFilter(
                          lowStockOnly: selected,
                          search: _searchController.text.trim(),
                        );
                  },
                ),
              ],
            ),
          ),

          // Inventory List
          Expanded(
            child: inventoryState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : inventoryState.parts.isEmpty
                ? EmptyState(
                    icon: Icons.inventory_2_outlined,
                    title: 'No Parts in Inventory',
                    subtitle: _lowStockOnly
                        ? 'Great news! All spare parts are above minimum stock levels.'
                        : 'Add spare parts, oil, tires, and maintenance consumables.',
                  )
                : RefreshIndicator(
                    onRefresh: () =>
                        ref.read(inventoryProvider.notifier).loadParts(),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: inventoryState.parts.length,
                      separatorBuilder: (_, index) =>
                          const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final part = inventoryState.parts[index];
                        return _buildPartCard(context, part, l10n);
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildPartCard(
    BuildContext context,
    Part part,
    AppLocalizations l10n,
  ) {
    final isLow = part.isLowStock;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: isLow
              ? Colors.red.withAlpha(120)
              : Theme.of(context).colorScheme.outlineVariant.withAlpha(80),
          width: isLow ? 1.5 : 1,
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
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.blueGrey.withAlpha(30),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        part.partCode,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Theme.of(
                          context,
                        ).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        part.category,
                        style: const TextStyle(fontSize: 11),
                      ),
                    ),
                  ],
                ),
                if (isLow)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red.withAlpha(20),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.warning, size: 14, color: Colors.red),
                        SizedBox(width: 4),
                        Text(
                          'LOW STOCK',
                          style: TextStyle(
                            color: Colors.red,
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              part.name,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            if (part.description != null && part.description!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                part.description!,
                style: Theme.of(context).textTheme.bodySmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const Divider(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.inventoryCurrentStock,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    Text(
                      '${part.currentQuantity.toStringAsFixed(0)} ${part.unitOfMeasure}',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: isLow ? Colors.red : null,
                      ),
                    ),
                    Text(
                      'Min: ${part.minReorderLevel.toStringAsFixed(0)} ${part.unitOfMeasure}',
                      style: const TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      l10n.inventoryUnitCost,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    Text(
                      CurrencyFormatter.format(
                        part.defaultUnitCost,
                        part.costCurrency,
                      ),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    OutlinedButton.icon(
                      onPressed: () => _showStockMovementDialog(part),
                      icon: const Icon(Icons.sync_alt, size: 14),
                      label: Text(
                        l10n.inventoryStockMove,
                        style: const TextStyle(fontSize: 12),
                      ),
                      style: OutlinedButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

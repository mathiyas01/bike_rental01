class Part {
  final String id;
  final String partCode;
  final String name;
  final String category;
  final String? description;
  final String unitOfMeasure;
  final double currentQuantity;
  final double minReorderLevel;
  final double defaultUnitCost;
  final String costCurrency;
  final String? defaultSupplierId;
  final String? defaultSupplierName;
  final bool isLowStock;
  final bool active;
  final String createdAt;

  Part({
    required this.id,
    required this.partCode,
    required this.name,
    required this.category,
    this.description,
    required this.unitOfMeasure,
    required this.currentQuantity,
    required this.minReorderLevel,
    required this.defaultUnitCost,
    required this.costCurrency,
    this.defaultSupplierId,
    this.defaultSupplierName,
    required this.isLowStock,
    required this.active,
    required this.createdAt,
  });

  factory Part.fromJson(Map<String, dynamic> json) {
    return Part(
      id: json['id'] ?? '',
      partCode: json['partCode'] ?? '',
      name: json['name'] ?? '',
      category: json['category'] ?? 'GENERAL',
      description: json['description'],
      unitOfMeasure: json['unitOfMeasure'] ?? 'PIECE',
      currentQuantity: (json['currentQuantity'] as num?)?.toDouble() ?? 0.0,
      minReorderLevel: (json['minReorderLevel'] as num?)?.toDouble() ?? 0.0,
      defaultUnitCost: (json['defaultUnitCost'] as num?)?.toDouble() ?? 0.0,
      costCurrency: json['costCurrency'] ?? 'RON',
      defaultSupplierId: json['defaultSupplierId'],
      defaultSupplierName: json['defaultSupplierName'],
      isLowStock: json['lowStock'] ?? false,
      active: json['active'] ?? true,
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class ServicePartUsage {
  final String id;
  final String partId;
  final String partCode;
  final String partName;
  final double quantity;
  final double unitCost;
  final double totalCost;
  final String currency;

  ServicePartUsage({
    required this.id,
    required this.partId,
    required this.partCode,
    required this.partName,
    required this.quantity,
    required this.unitCost,
    required this.totalCost,
    required this.currency,
  });

  factory ServicePartUsage.fromJson(Map<String, dynamic> json) {
    return ServicePartUsage(
      id: json['id'] ?? '',
      partId: json['partId'] ?? '',
      partCode: json['partCode'] ?? '',
      partName: json['partName'] ?? '',
      quantity: (json['quantity'] as num?)?.toDouble() ?? 0.0,
      unitCost: (json['unitCost'] as num?)?.toDouble() ?? 0.0,
      totalCost: (json['totalCost'] as num?)?.toDouble() ?? 0.0,
      currency: json['currency'] ?? 'RON',
    );
  }
}

class ServiceRecord {
  final String id;
  final String bikeId;
  final String bikeRegistrationNumber;
  final String bikeMakeModel;
  final String serviceDate;
  final double odometerReading;
  final String serviceProvider;
  final String workPerformed;
  final double labourCost;
  final String labourCurrency;
  final double partsCost;
  final double totalCost;
  final String status;
  final String? nextServiceDueDate;
  final double? nextServiceDueOdometer;
  final String? notes;
  final List<ServicePartUsage> partsUsed;
  final String createdAt;

  ServiceRecord({
    required this.id,
    required this.bikeId,
    required this.bikeRegistrationNumber,
    required this.bikeMakeModel,
    required this.serviceDate,
    required this.odometerReading,
    required this.serviceProvider,
    required this.workPerformed,
    required this.labourCost,
    required this.labourCurrency,
    required this.partsCost,
    required this.totalCost,
    required this.status,
    this.nextServiceDueDate,
    this.nextServiceDueOdometer,
    this.notes,
    this.partsUsed = const [],
    required this.createdAt,
  });

  factory ServiceRecord.fromJson(Map<String, dynamic> json) {
    var parts = <ServicePartUsage>[];
    if (json['partsUsed'] != null) {
      parts = (json['partsUsed'] as List)
          .map((i) => ServicePartUsage.fromJson(i))
          .toList();
    }

    return ServiceRecord(
      id: json['id'] ?? '',
      bikeId: json['bikeId'] ?? '',
      bikeRegistrationNumber: json['bikeRegistrationNumber'] ?? '',
      bikeMakeModel: json['bikeMakeModel'] ?? '',
      serviceDate: json['serviceDate'] ?? '',
      odometerReading: (json['odometerReading'] as num?)?.toDouble() ?? 0.0,
      serviceProvider: json['serviceProvider'] ?? '',
      workPerformed: json['workPerformed'] ?? '',
      labourCost: (json['labourCost'] as num?)?.toDouble() ?? 0.0,
      labourCurrency: json['labourCurrency'] ?? 'RON',
      partsCost: (json['partsCost'] as num?)?.toDouble() ?? 0.0,
      totalCost: (json['totalCost'] as num?)?.toDouble() ?? 0.0,
      status: json['status'] ?? 'COMPLETED',
      nextServiceDueDate: json['nextServiceDueDate'],
      nextServiceDueOdometer:
          (json['nextServiceDueOdometer'] as num?)?.toDouble(),
      notes: json['notes'],
      partsUsed: parts,
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class BikeModel {
  final String id;
  final String registrationNumber;
  final String vin;
  final String make;
  final String model;
  final int yearOfManufacture;
  final double currentOdometer;
  final DateTime? itpExpiryDate;
  final DateTime? rcaExpiryDate;
  final DateTime? cascoExpiryDate;
  final String status;
  final String? notes;
  final bool archived;

  BikeModel({
    required this.id,
    required this.registrationNumber,
    required this.vin,
    required this.make,
    required this.model,
    required this.yearOfManufacture,
    required this.currentOdometer,
    this.itpExpiryDate,
    this.rcaExpiryDate,
    this.cascoExpiryDate,
    required this.status,
    this.notes,
    required this.archived,
  });

  factory BikeModel.fromJson(Map<String, dynamic> json) {
    return BikeModel(
      id: json['id']?.toString() ?? '',
      registrationNumber: json['registrationNumber']?.toString() ?? '',
      vin: json['vin']?.toString() ?? '',
      make: json['make']?.toString() ?? '',
      model: json['model']?.toString() ?? '',
      yearOfManufacture: (json['yearOfManufacture'] as num?)?.toInt() ?? 2024,
      currentOdometer: (json['currentOdometer'] as num?)?.toDouble() ?? 0.0,
      itpExpiryDate: json['itpExpiryDate'] != null ? DateTime.tryParse(json['itpExpiryDate'].toString()) : null,
      rcaExpiryDate: json['rcaExpiryDate'] != null ? DateTime.tryParse(json['rcaExpiryDate'].toString()) : null,
      cascoExpiryDate: json['cascoExpiryDate'] != null ? DateTime.tryParse(json['cascoExpiryDate'].toString()) : null,
      status: json['status']?.toString() ?? 'AVAILABLE',
      notes: json['notes']?.toString(),
      archived: json['archived'] == true,
    );
  }
}

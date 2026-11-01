class RentalModel {
  final String id;
  final String customerId;
  final String customerName;
  final String customerPhone;
  final String motorbikeId;
  final String bikeRegistrationNumber;
  final String bikeMakeModel;
  final DateTime startDate;
  final DateTime? plannedEndDate;
  final DateTime? actualClosedDate;
  final double weeklyRate;
  final String currency;
  final double depositAmount;
  final String depositCurrency;
  final String paymentFrequency;
  final String status;
  final String? termsAndNotes;

  RentalModel({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    required this.motorbikeId,
    required this.bikeRegistrationNumber,
    required this.bikeMakeModel,
    required this.startDate,
    this.plannedEndDate,
    this.actualClosedDate,
    required this.weeklyRate,
    required this.currency,
    required this.depositAmount,
    required this.depositCurrency,
    required this.paymentFrequency,
    required this.status,
    this.termsAndNotes,
  });

  factory RentalModel.fromJson(Map<String, dynamic> json) {
    return RentalModel(
      id: json['id']?.toString() ?? '',
      customerId: json['customerId']?.toString() ?? '',
      customerName: json['customerName']?.toString() ?? '',
      customerPhone: json['customerPhone']?.toString() ?? '',
      motorbikeId: json['motorbikeId']?.toString() ?? '',
      bikeRegistrationNumber: json['bikeRegistrationNumber']?.toString() ?? '',
      bikeMakeModel: json['bikeMakeModel']?.toString() ?? '',
      startDate: DateTime.tryParse(json['startDate'].toString()) ?? DateTime.now(),
      plannedEndDate: json['plannedEndDate'] != null ? DateTime.tryParse(json['plannedEndDate'].toString()) : null,
      actualClosedDate: json['actualClosedDate'] != null ? DateTime.tryParse(json['actualClosedDate'].toString()) : null,
      weeklyRate: (json['weeklyRate'] as num?)?.toDouble() ?? 0.0,
      currency: json['currency']?.toString() ?? 'RON',
      depositAmount: (json['depositAmount'] as num?)?.toDouble() ?? 0.0,
      depositCurrency: json['depositCurrency']?.toString() ?? 'RON',
      paymentFrequency: json['paymentFrequency']?.toString() ?? 'WEEKLY',
      status: json['status']?.toString() ?? 'ACTIVE',
      termsAndNotes: json['termsAndNotes']?.toString(),
    );
  }
}

class RentalChargeModel {
  final String id;
  final int chargeSequence;
  final DateTime periodStartDate;
  final DateTime periodEndDate;
  final DateTime dueDate;
  final double amount;
  final String currency;
  final String status;
  final double paidAmount;
  final double remainingAmount;

  RentalChargeModel({
    required this.id,
    required this.chargeSequence,
    required this.periodStartDate,
    required this.periodEndDate,
    required this.dueDate,
    required this.amount,
    required this.currency,
    required this.status,
    required this.paidAmount,
    required this.remainingAmount,
  });

  factory RentalChargeModel.fromJson(Map<String, dynamic> json) {
    return RentalChargeModel(
      id: json['id']?.toString() ?? '',
      chargeSequence: (json['chargeSequence'] as num?)?.toInt() ?? 1,
      periodStartDate: DateTime.tryParse(json['periodStartDate'].toString()) ?? DateTime.now(),
      periodEndDate: DateTime.tryParse(json['periodEndDate'].toString()) ?? DateTime.now(),
      dueDate: DateTime.tryParse(json['dueDate'].toString()) ?? DateTime.now(),
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      currency: json['currency']?.toString() ?? 'RON',
      status: json['status']?.toString() ?? 'UNPAID',
      paidAmount: (json['paidAmount'] as num?)?.toDouble() ?? 0.0,
      remainingAmount: (json['remainingAmount'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

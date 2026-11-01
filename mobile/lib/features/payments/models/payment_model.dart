class PaymentAllocation {
  final String id;
  final String rentalChargeId;
  final int sequenceNumber;
  final double allocatedAmount;
  final String createdAt;

  PaymentAllocation({
    required this.id,
    required this.rentalChargeId,
    required this.sequenceNumber,
    required this.allocatedAmount,
    required this.createdAt,
  });

  factory PaymentAllocation.fromJson(Map<String, dynamic> json) {
    return PaymentAllocation(
      id: json['id'] ?? '',
      rentalChargeId: json['rentalChargeId'] ?? '',
      sequenceNumber: json['sequenceNumber'] ?? 0,
      allocatedAmount: (json['allocatedAmount'] as num?)?.toDouble() ?? 0.0,
      createdAt: json['createdAt'] ?? '',
    );
  }
}

class Payment {
  final String id;
  final String customerId;
  final String customerName;
  final String? rentalId;
  final String paymentDate;
  final double amount;
  final String currency;
  final String paymentMethod;
  final String? referenceNumber;
  final String? notes;
  final String status; // CONFIRMED, REVERSED
  final String? recordedByUserName;
  final List<PaymentAllocation> allocations;
  final String? reversalReason;
  final String? reversedAt;
  final String createdAt;

  Payment({
    required this.id,
    required this.customerId,
    required this.customerName,
    this.rentalId,
    required this.paymentDate,
    required this.amount,
    required this.currency,
    required this.paymentMethod,
    this.referenceNumber,
    this.notes,
    required this.status,
    this.recordedByUserName,
    this.allocations = const [],
    this.reversalReason,
    this.reversedAt,
    required this.createdAt,
  });

  bool get isReversed => status == 'REVERSED';

  factory Payment.fromJson(Map<String, dynamic> json) {
    var allocList = <PaymentAllocation>[];
    if (json['allocations'] != null) {
      allocList = (json['allocations'] as List)
          .map((i) => PaymentAllocation.fromJson(i))
          .toList();
    }

    return Payment(
      id: json['id'] ?? '',
      customerId: json['customerId'] ?? '',
      customerName: json['customerName'] ?? '',
      rentalId: json['rentalId'],
      paymentDate: json['paymentDate'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      currency: json['currency'] ?? 'RON',
      paymentMethod: json['paymentMethod'] ?? 'CASH',
      referenceNumber: json['referenceNumber'],
      notes: json['notes'],
      status: json['status'] ?? 'CONFIRMED',
      recordedByUserName: json['recordedByUserName'],
      allocations: allocList,
      reversalReason: json['reversalReason'],
      reversedAt: json['reversedAt'],
      createdAt: json['createdAt'] ?? '',
    );
  }
}

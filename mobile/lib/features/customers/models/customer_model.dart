class CustomerModel {
  final String id;
  final String fullName;
  final String phone;
  final String? email;
  final String? cnpOrTaxId;
  final DateTime? dateOfBirth;
  final String? livingCity;
  final String? drivingLicenceNumber;
  final String? licenceCategories;
  final DateTime? licenceExpiryDate;
  final String? address;
  final String? notes;
  final bool archived;

  CustomerModel({
    required this.id,
    required this.fullName,
    required this.phone,
    this.email,
    this.cnpOrTaxId,
    this.dateOfBirth,
    this.livingCity,
    this.drivingLicenceNumber,
    this.licenceCategories,
    this.licenceExpiryDate,
    this.address,
    this.notes,
    required this.archived,
  });

  factory CustomerModel.fromJson(Map<String, dynamic> json) {
    return CustomerModel(
      id: json['id']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      email: json['email']?.toString(),
      cnpOrTaxId: json['cnpOrTaxId']?.toString(),
      dateOfBirth: json['dateOfBirth'] != null
          ? DateTime.tryParse(json['dateOfBirth'].toString())
          : null,
      livingCity: json['livingCity']?.toString(),
      drivingLicenceNumber: json['drivingLicenceNumber']?.toString(),
      licenceCategories: json['licenceCategories']?.toString(),
      licenceExpiryDate: json['licenceExpiryDate'] != null
          ? DateTime.tryParse(json['licenceExpiryDate'].toString())
          : null,
      address: json['address']?.toString(),
      notes: json['notes']?.toString(),
      archived: json['archived'] == true,
    );
  }
}

class CustomerBalanceItem {
  final String currency;
  final double totalBilled;
  final double totalPaid;
  final double totalOutstanding;

  CustomerBalanceItem({
    required this.currency,
    required this.totalBilled,
    required this.totalPaid,
    required this.totalOutstanding,
  });

  factory CustomerBalanceItem.fromJson(Map<String, dynamic> json) {
    return CustomerBalanceItem(
      currency: json['currency']?.toString() ?? 'RON',
      totalBilled: (json['totalBilled'] as num?)?.toDouble() ?? 0.0,
      totalPaid: (json['totalPaid'] as num?)?.toDouble() ?? 0.0,
      totalOutstanding: (json['totalOutstanding'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class CustomerBalanceSummary {
  final String customerId;
  final String customerName;
  final Map<String, CustomerBalanceItem> balances;

  CustomerBalanceSummary({
    required this.customerId,
    required this.customerName,
    required this.balances,
  });

  factory CustomerBalanceSummary.fromJson(Map<String, dynamic> json) {
    final balMap = <String, CustomerBalanceItem>{};
    if (json['balances'] is Map) {
      (json['balances'] as Map).forEach((k, v) {
        balMap[k.toString()] = CustomerBalanceItem.fromJson(
          v as Map<String, dynamic>,
        );
      });
    }
    return CustomerBalanceSummary(
      customerId: json['customerId']?.toString() ?? '',
      customerName: json['customerName']?.toString() ?? '',
      balances: balMap,
    );
  }
}

class UserModel {
  final String id;
  final String email;
  final String fullName;
  final String role;
  final String preferredLanguage;
  final String preferredCurrency;

  UserModel({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.preferredLanguage,
    required this.preferredCurrency,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      role: json['role']?.toString() ?? 'ROLE_OWNER',
      preferredLanguage: json['preferredLanguage']?.toString() ?? 'en',
      preferredCurrency:
          json['preferredCurrency']?.toString().toUpperCase() ?? 'RON',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'fullName': fullName,
      'role': role,
      'preferredLanguage': preferredLanguage,
      'preferredCurrency': preferredCurrency,
    };
  }
}

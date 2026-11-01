// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'MotoRental Pro';

  @override
  String get login => 'Log In';

  @override
  String get loginTitle => 'Welcome Back';

  @override
  String get loginSubtitle =>
      'Sign in to manage your motorbike fleet and rentals';

  @override
  String get email => 'Email Address';

  @override
  String get password => 'Password';

  @override
  String get logout => 'Log Out';

  @override
  String get logoutConfirm => 'Are you sure you want to log out?';

  @override
  String get navDashboard => 'Dashboard';

  @override
  String get navBikes => 'Fleet';

  @override
  String get navCustomers => 'Customers';

  @override
  String get navRentals => 'Rentals';

  @override
  String get navMore => 'More';

  @override
  String get navServicing => 'Servicing';

  @override
  String get navInventory => 'Inventory';

  @override
  String get navReports => 'Reports';

  @override
  String get navSettings => 'Settings';

  @override
  String get commonSave => 'Save';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonConfirm => 'Confirm';

  @override
  String get commonDelete => 'Delete';

  @override
  String get commonEdit => 'Edit';

  @override
  String get commonArchive => 'Archive';

  @override
  String get commonUnarchive => 'Restore';

  @override
  String get commonSearch => 'Search...';

  @override
  String get commonFilter => 'Filter';

  @override
  String get commonDetails => 'Details';

  @override
  String get commonNotes => 'Notes';

  @override
  String get commonStatus => 'Status';

  @override
  String get commonCurrency => 'Currency';

  @override
  String get commonAmount => 'Amount';

  @override
  String get commonDate => 'Date';

  @override
  String get commonTotal => 'Total';

  @override
  String get commonActions => 'Actions';

  @override
  String get commonSuccess => 'Operation completed successfully';

  @override
  String get commonError => 'An error occurred. Please try again.';

  @override
  String get kpiActiveRentals => 'Active Rentals';

  @override
  String get kpiAvailableBikes => 'Available Bikes';

  @override
  String get kpiInService => 'In Maintenance';

  @override
  String get kpiFleetSize => 'Total Fleet';

  @override
  String get kpiOverdueRent => 'Due / Overdue Rent';

  @override
  String get kpiLowStockAlerts => 'Low Stock Alerts';

  @override
  String get kpiMonthlyRevenue => 'Monthly Revenue';

  @override
  String get statusAvailable => 'Available';

  @override
  String get statusRented => 'Rented';

  @override
  String get statusInService => 'In Service';

  @override
  String get statusInactive => 'Inactive';

  @override
  String get statusActive => 'Active';

  @override
  String get statusClosed => 'Closed';

  @override
  String get statusCancelled => 'Cancelled';

  @override
  String get statusUnpaid => 'Unpaid';

  @override
  String get statusPartiallyPaid => 'Partially Paid';

  @override
  String get statusPaid => 'Paid';

  @override
  String get statusConfirmed => 'Confirmed';

  @override
  String get statusReversed => 'Reversed';

  @override
  String get bikeTitle => 'Motorbike Fleet';

  @override
  String get bikeAdd => 'Add Motorbike';

  @override
  String get bikePlate => 'Registration Plate';

  @override
  String get bikeVin => 'VIN / Frame Number';

  @override
  String get bikeMake => 'Make';

  @override
  String get bikeModel => 'Model';

  @override
  String get bikeYear => 'Year';

  @override
  String get bikeOdometer => 'Odometer (km)';

  @override
  String get bikeItp => 'ITP Expiry';

  @override
  String get bikeRca => 'RCA Expiry';

  @override
  String get bikeCasco => 'CASCO Expiry';

  @override
  String get customerTitle => 'Customers';

  @override
  String get customerAdd => 'Register Customer';

  @override
  String get customerName => 'Full Name';

  @override
  String get customerPhone => 'Phone Number';

  @override
  String get customerCnp => 'CNP / Tax ID';

  @override
  String get customerLicence => 'Driving Licence #';

  @override
  String get customerLicenceCat => 'Categories (e.g. A, A2, B)';

  @override
  String get customerLicenceExpiry => 'Licence Expiry';

  @override
  String get customerAddress => 'Residential Address';

  @override
  String get customerBalance => 'Financial Balances';

  @override
  String get rentalTitle => 'Rental Agreements';

  @override
  String get rentalCreate => 'New Rental Contract';

  @override
  String get rentalClose => 'Close Rental Contract';

  @override
  String get rentalStartDate => 'Start Date';

  @override
  String get rentalEndDate => 'Planned End Date';

  @override
  String get rentalWeeklyRate => 'Weekly Rent Rate';

  @override
  String get rentalDeposit => 'Security Deposit';

  @override
  String get rentalClosureDate => 'Actual Return Date';

  @override
  String get rentalDepositDisposition => 'Deposit Disposition';

  @override
  String get rentalCharges => 'Rental Payment Schedule';

  @override
  String get rentalChargeSeq => 'Week';

  @override
  String get paymentTitle => 'Payments & Allocations';

  @override
  String get paymentRecord => 'Record Payment';

  @override
  String get paymentReverse => 'Reverse Payment';

  @override
  String get paymentReverseReason => 'Reversal Reason';

  @override
  String get paymentMethod => 'Payment Method';

  @override
  String get paymentMethodCash => 'Cash';

  @override
  String get paymentMethodBank => 'Bank Transfer';

  @override
  String get paymentMethodCard => 'Card';

  @override
  String get paymentReference => 'Receipt / Ref #';

  @override
  String get paymentAllocationMode => 'Allocation Mode';

  @override
  String get paymentAutoFifo => 'Automatic (Oldest Rent Due First)';

  @override
  String get paymentManual => 'Manual Charge Selection';

  @override
  String get serviceTitle => 'Maintenance & Servicing';

  @override
  String get serviceLog => 'Log Service';

  @override
  String get serviceProvider => 'Workshop / Provider';

  @override
  String get serviceWork => 'Work Performed';

  @override
  String get serviceLabour => 'Labour Cost';

  @override
  String get serviceParts => 'Spare Parts Used';

  @override
  String get serviceNextDue => 'Next Service Due';

  @override
  String get inventoryTitle => 'Spare-Parts Inventory';

  @override
  String get inventoryPartAdd => 'Add Spare Part';

  @override
  String get inventoryPartCode => 'Part Code';

  @override
  String get inventoryPartName => 'Part Name';

  @override
  String get inventoryCategory => 'Category';

  @override
  String get inventoryCurrentStock => 'Current Quantity';

  @override
  String get inventoryMinLevel => 'Min Reorder Level';

  @override
  String get inventoryUnitCost => 'Unit Cost';

  @override
  String get inventoryUnitMeasure => 'Unit';

  @override
  String get inventoryStockMove => 'Record Stock Movement';

  @override
  String get inventoryStockIn => 'Stock In (Purchase)';

  @override
  String get inventoryStockOut => 'Stock Out (Usage/Scrap)';

  @override
  String get reportTitle => 'Financial & Fleet Analytics';

  @override
  String get reportUtilization => 'Fleet Utilization';

  @override
  String get reportBikeRoi => 'Motorbike Profitability (ROI)';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsLanguage => 'Application Language';

  @override
  String get settingsLanguageEn => 'English (Default)';

  @override
  String get settingsLanguageRo => 'Română (Romanian)';

  @override
  String get settingsTheme => 'Theme Mode';

  @override
  String get settingsThemeDark => 'Dark Mode';

  @override
  String get settingsThemeLight => 'Light Mode';

  @override
  String get settingsServerUrl => 'Backend API URL';
}

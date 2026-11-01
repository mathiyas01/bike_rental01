import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_ro.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('ro'),
  ];

  /// Main application title
  ///
  /// In en, this message translates to:
  /// **'MotoRental Pro'**
  String get appTitle;

  /// No description provided for @login.
  ///
  /// In en, this message translates to:
  /// **'Log In'**
  String get login;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome Back'**
  String get loginTitle;

  /// No description provided for @loginSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to manage your motorbike fleet and rentals'**
  String get loginSubtitle;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email Address'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Log Out'**
  String get logout;

  /// No description provided for @logoutConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to log out?'**
  String get logoutConfirm;

  /// No description provided for @navDashboard.
  ///
  /// In en, this message translates to:
  /// **'Dashboard'**
  String get navDashboard;

  /// No description provided for @navBikes.
  ///
  /// In en, this message translates to:
  /// **'Fleet'**
  String get navBikes;

  /// No description provided for @navCustomers.
  ///
  /// In en, this message translates to:
  /// **'Customers'**
  String get navCustomers;

  /// No description provided for @navRentals.
  ///
  /// In en, this message translates to:
  /// **'Rentals'**
  String get navRentals;

  /// No description provided for @navMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get navMore;

  /// No description provided for @navServicing.
  ///
  /// In en, this message translates to:
  /// **'Servicing'**
  String get navServicing;

  /// No description provided for @navInventory.
  ///
  /// In en, this message translates to:
  /// **'Inventory'**
  String get navInventory;

  /// No description provided for @navReports.
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get navReports;

  /// No description provided for @navSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get commonConfirm;

  /// No description provided for @commonDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// No description provided for @commonEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get commonEdit;

  /// No description provided for @commonArchive.
  ///
  /// In en, this message translates to:
  /// **'Archive'**
  String get commonArchive;

  /// No description provided for @commonUnarchive.
  ///
  /// In en, this message translates to:
  /// **'Restore'**
  String get commonUnarchive;

  /// No description provided for @commonSearch.
  ///
  /// In en, this message translates to:
  /// **'Search...'**
  String get commonSearch;

  /// No description provided for @commonFilter.
  ///
  /// In en, this message translates to:
  /// **'Filter'**
  String get commonFilter;

  /// No description provided for @commonDetails.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get commonDetails;

  /// No description provided for @commonNotes.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get commonNotes;

  /// No description provided for @commonStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get commonStatus;

  /// No description provided for @commonCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get commonCurrency;

  /// No description provided for @commonAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get commonAmount;

  /// No description provided for @commonDate.
  ///
  /// In en, this message translates to:
  /// **'Date'**
  String get commonDate;

  /// No description provided for @commonTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get commonTotal;

  /// No description provided for @commonActions.
  ///
  /// In en, this message translates to:
  /// **'Actions'**
  String get commonActions;

  /// No description provided for @commonSuccess.
  ///
  /// In en, this message translates to:
  /// **'Operation completed successfully'**
  String get commonSuccess;

  /// No description provided for @commonError.
  ///
  /// In en, this message translates to:
  /// **'An error occurred. Please try again.'**
  String get commonError;

  /// No description provided for @kpiActiveRentals.
  ///
  /// In en, this message translates to:
  /// **'Active Rentals'**
  String get kpiActiveRentals;

  /// No description provided for @kpiAvailableBikes.
  ///
  /// In en, this message translates to:
  /// **'Available Bikes'**
  String get kpiAvailableBikes;

  /// No description provided for @kpiInService.
  ///
  /// In en, this message translates to:
  /// **'In Maintenance'**
  String get kpiInService;

  /// No description provided for @kpiFleetSize.
  ///
  /// In en, this message translates to:
  /// **'Total Fleet'**
  String get kpiFleetSize;

  /// No description provided for @kpiOverdueRent.
  ///
  /// In en, this message translates to:
  /// **'Due / Overdue Rent'**
  String get kpiOverdueRent;

  /// No description provided for @kpiLowStockAlerts.
  ///
  /// In en, this message translates to:
  /// **'Low Stock Alerts'**
  String get kpiLowStockAlerts;

  /// No description provided for @kpiMonthlyRevenue.
  ///
  /// In en, this message translates to:
  /// **'Monthly Revenue'**
  String get kpiMonthlyRevenue;

  /// No description provided for @statusAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get statusAvailable;

  /// No description provided for @statusRented.
  ///
  /// In en, this message translates to:
  /// **'Rented'**
  String get statusRented;

  /// No description provided for @statusInService.
  ///
  /// In en, this message translates to:
  /// **'In Service'**
  String get statusInService;

  /// No description provided for @statusInactive.
  ///
  /// In en, this message translates to:
  /// **'Inactive'**
  String get statusInactive;

  /// No description provided for @statusActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get statusActive;

  /// No description provided for @statusClosed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get statusClosed;

  /// No description provided for @statusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get statusCancelled;

  /// No description provided for @statusUnpaid.
  ///
  /// In en, this message translates to:
  /// **'Unpaid'**
  String get statusUnpaid;

  /// No description provided for @statusPartiallyPaid.
  ///
  /// In en, this message translates to:
  /// **'Partially Paid'**
  String get statusPartiallyPaid;

  /// No description provided for @statusPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get statusPaid;

  /// No description provided for @statusConfirmed.
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get statusConfirmed;

  /// No description provided for @statusReversed.
  ///
  /// In en, this message translates to:
  /// **'Reversed'**
  String get statusReversed;

  /// No description provided for @bikeTitle.
  ///
  /// In en, this message translates to:
  /// **'Motorbike Fleet'**
  String get bikeTitle;

  /// No description provided for @bikeAdd.
  ///
  /// In en, this message translates to:
  /// **'Add Motorbike'**
  String get bikeAdd;

  /// No description provided for @bikePlate.
  ///
  /// In en, this message translates to:
  /// **'Registration Plate'**
  String get bikePlate;

  /// No description provided for @bikeVin.
  ///
  /// In en, this message translates to:
  /// **'VIN / Frame Number'**
  String get bikeVin;

  /// No description provided for @bikeMake.
  ///
  /// In en, this message translates to:
  /// **'Make'**
  String get bikeMake;

  /// No description provided for @bikeModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get bikeModel;

  /// No description provided for @bikeYear.
  ///
  /// In en, this message translates to:
  /// **'Year'**
  String get bikeYear;

  /// No description provided for @bikeOdometer.
  ///
  /// In en, this message translates to:
  /// **'Odometer (km)'**
  String get bikeOdometer;

  /// No description provided for @bikeItp.
  ///
  /// In en, this message translates to:
  /// **'ITP Expiry'**
  String get bikeItp;

  /// No description provided for @bikeRca.
  ///
  /// In en, this message translates to:
  /// **'RCA Expiry'**
  String get bikeRca;

  /// No description provided for @bikeCasco.
  ///
  /// In en, this message translates to:
  /// **'CASCO Expiry'**
  String get bikeCasco;

  /// No description provided for @customerTitle.
  ///
  /// In en, this message translates to:
  /// **'Customers'**
  String get customerTitle;

  /// No description provided for @customerAdd.
  ///
  /// In en, this message translates to:
  /// **'Register Customer'**
  String get customerAdd;

  /// No description provided for @customerName.
  ///
  /// In en, this message translates to:
  /// **'Full Name'**
  String get customerName;

  /// No description provided for @customerPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone Number'**
  String get customerPhone;

  /// No description provided for @customerCnp.
  ///
  /// In en, this message translates to:
  /// **'CNP / Tax ID'**
  String get customerCnp;

  /// No description provided for @customerLicence.
  ///
  /// In en, this message translates to:
  /// **'Driving Licence #'**
  String get customerLicence;

  /// No description provided for @customerLicenceCat.
  ///
  /// In en, this message translates to:
  /// **'Categories (e.g. A, A2, B)'**
  String get customerLicenceCat;

  /// No description provided for @customerLicenceExpiry.
  ///
  /// In en, this message translates to:
  /// **'Licence Expiry'**
  String get customerLicenceExpiry;

  /// No description provided for @customerAddress.
  ///
  /// In en, this message translates to:
  /// **'Residential Address'**
  String get customerAddress;

  /// No description provided for @customerBalance.
  ///
  /// In en, this message translates to:
  /// **'Financial Balances'**
  String get customerBalance;

  /// No description provided for @rentalTitle.
  ///
  /// In en, this message translates to:
  /// **'Rental Agreements'**
  String get rentalTitle;

  /// No description provided for @rentalCreate.
  ///
  /// In en, this message translates to:
  /// **'New Rental Contract'**
  String get rentalCreate;

  /// No description provided for @rentalClose.
  ///
  /// In en, this message translates to:
  /// **'Close Rental Contract'**
  String get rentalClose;

  /// No description provided for @rentalStartDate.
  ///
  /// In en, this message translates to:
  /// **'Start Date'**
  String get rentalStartDate;

  /// No description provided for @rentalEndDate.
  ///
  /// In en, this message translates to:
  /// **'Planned End Date'**
  String get rentalEndDate;

  /// No description provided for @rentalWeeklyRate.
  ///
  /// In en, this message translates to:
  /// **'Weekly Rent Rate'**
  String get rentalWeeklyRate;

  /// No description provided for @rentalDeposit.
  ///
  /// In en, this message translates to:
  /// **'Security Deposit'**
  String get rentalDeposit;

  /// No description provided for @rentalClosureDate.
  ///
  /// In en, this message translates to:
  /// **'Actual Return Date'**
  String get rentalClosureDate;

  /// No description provided for @rentalDepositDisposition.
  ///
  /// In en, this message translates to:
  /// **'Deposit Disposition'**
  String get rentalDepositDisposition;

  /// No description provided for @rentalCharges.
  ///
  /// In en, this message translates to:
  /// **'Rental Payment Schedule'**
  String get rentalCharges;

  /// No description provided for @rentalChargeSeq.
  ///
  /// In en, this message translates to:
  /// **'Week'**
  String get rentalChargeSeq;

  /// No description provided for @paymentTitle.
  ///
  /// In en, this message translates to:
  /// **'Payments & Allocations'**
  String get paymentTitle;

  /// No description provided for @paymentRecord.
  ///
  /// In en, this message translates to:
  /// **'Record Payment'**
  String get paymentRecord;

  /// No description provided for @paymentReverse.
  ///
  /// In en, this message translates to:
  /// **'Reverse Payment'**
  String get paymentReverse;

  /// No description provided for @paymentReverseReason.
  ///
  /// In en, this message translates to:
  /// **'Reversal Reason'**
  String get paymentReverseReason;

  /// No description provided for @paymentMethod.
  ///
  /// In en, this message translates to:
  /// **'Payment Method'**
  String get paymentMethod;

  /// No description provided for @paymentMethodCash.
  ///
  /// In en, this message translates to:
  /// **'Cash'**
  String get paymentMethodCash;

  /// No description provided for @paymentMethodBank.
  ///
  /// In en, this message translates to:
  /// **'Bank Transfer'**
  String get paymentMethodBank;

  /// No description provided for @paymentMethodCard.
  ///
  /// In en, this message translates to:
  /// **'Card'**
  String get paymentMethodCard;

  /// No description provided for @paymentReference.
  ///
  /// In en, this message translates to:
  /// **'Receipt / Ref #'**
  String get paymentReference;

  /// No description provided for @paymentAllocationMode.
  ///
  /// In en, this message translates to:
  /// **'Allocation Mode'**
  String get paymentAllocationMode;

  /// No description provided for @paymentAutoFifo.
  ///
  /// In en, this message translates to:
  /// **'Automatic (Oldest Rent Due First)'**
  String get paymentAutoFifo;

  /// No description provided for @paymentManual.
  ///
  /// In en, this message translates to:
  /// **'Manual Charge Selection'**
  String get paymentManual;

  /// No description provided for @serviceTitle.
  ///
  /// In en, this message translates to:
  /// **'Maintenance & Servicing'**
  String get serviceTitle;

  /// No description provided for @serviceLog.
  ///
  /// In en, this message translates to:
  /// **'Log Service'**
  String get serviceLog;

  /// No description provided for @serviceProvider.
  ///
  /// In en, this message translates to:
  /// **'Workshop / Provider'**
  String get serviceProvider;

  /// No description provided for @serviceWork.
  ///
  /// In en, this message translates to:
  /// **'Work Performed'**
  String get serviceWork;

  /// No description provided for @serviceLabour.
  ///
  /// In en, this message translates to:
  /// **'Labour Cost'**
  String get serviceLabour;

  /// No description provided for @serviceParts.
  ///
  /// In en, this message translates to:
  /// **'Spare Parts Used'**
  String get serviceParts;

  /// No description provided for @serviceNextDue.
  ///
  /// In en, this message translates to:
  /// **'Next Service Due'**
  String get serviceNextDue;

  /// No description provided for @inventoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Spare-Parts Inventory'**
  String get inventoryTitle;

  /// No description provided for @inventoryPartAdd.
  ///
  /// In en, this message translates to:
  /// **'Add Spare Part'**
  String get inventoryPartAdd;

  /// No description provided for @inventoryPartCode.
  ///
  /// In en, this message translates to:
  /// **'Part Code'**
  String get inventoryPartCode;

  /// No description provided for @inventoryPartName.
  ///
  /// In en, this message translates to:
  /// **'Part Name'**
  String get inventoryPartName;

  /// No description provided for @inventoryCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get inventoryCategory;

  /// No description provided for @inventoryCurrentStock.
  ///
  /// In en, this message translates to:
  /// **'Current Quantity'**
  String get inventoryCurrentStock;

  /// No description provided for @inventoryMinLevel.
  ///
  /// In en, this message translates to:
  /// **'Min Reorder Level'**
  String get inventoryMinLevel;

  /// No description provided for @inventoryUnitCost.
  ///
  /// In en, this message translates to:
  /// **'Unit Cost'**
  String get inventoryUnitCost;

  /// No description provided for @inventoryUnitMeasure.
  ///
  /// In en, this message translates to:
  /// **'Unit'**
  String get inventoryUnitMeasure;

  /// No description provided for @inventoryStockMove.
  ///
  /// In en, this message translates to:
  /// **'Record Stock Movement'**
  String get inventoryStockMove;

  /// No description provided for @inventoryStockIn.
  ///
  /// In en, this message translates to:
  /// **'Stock In (Purchase)'**
  String get inventoryStockIn;

  /// No description provided for @inventoryStockOut.
  ///
  /// In en, this message translates to:
  /// **'Stock Out (Usage/Scrap)'**
  String get inventoryStockOut;

  /// No description provided for @reportTitle.
  ///
  /// In en, this message translates to:
  /// **'Financial & Fleet Analytics'**
  String get reportTitle;

  /// No description provided for @reportUtilization.
  ///
  /// In en, this message translates to:
  /// **'Fleet Utilization'**
  String get reportUtilization;

  /// No description provided for @reportBikeRoi.
  ///
  /// In en, this message translates to:
  /// **'Motorbike Profitability (ROI)'**
  String get reportBikeRoi;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsLanguage.
  ///
  /// In en, this message translates to:
  /// **'Application Language'**
  String get settingsLanguage;

  /// No description provided for @settingsLanguageEn.
  ///
  /// In en, this message translates to:
  /// **'English (Default)'**
  String get settingsLanguageEn;

  /// No description provided for @settingsLanguageRo.
  ///
  /// In en, this message translates to:
  /// **'Română (Romanian)'**
  String get settingsLanguageRo;

  /// No description provided for @settingsTheme.
  ///
  /// In en, this message translates to:
  /// **'Theme Mode'**
  String get settingsTheme;

  /// No description provided for @settingsThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark Mode'**
  String get settingsThemeDark;

  /// No description provided for @settingsThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light Mode'**
  String get settingsThemeLight;

  /// No description provided for @settingsServerUrl.
  ///
  /// In en, this message translates to:
  /// **'Backend API URL'**
  String get settingsServerUrl;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'ro'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'ro':
      return AppLocalizationsRo();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}

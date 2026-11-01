// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Romanian Moldavian Moldovan (`ro`).
class AppLocalizationsRo extends AppLocalizations {
  AppLocalizationsRo([String locale = 'ro']) : super(locale);

  @override
  String get appTitle => 'MotoRental Pro';

  @override
  String get login => 'Autentificare';

  @override
  String get loginTitle => 'Bine ați revenit';

  @override
  String get loginSubtitle =>
      'Conectați-vă pentru a gestiona flota și contractele';

  @override
  String get email => 'Adresă de email';

  @override
  String get password => 'Parolă';

  @override
  String get logout => 'Deconectare';

  @override
  String get logoutConfirm => 'Sigur doriți să vă deconectați?';

  @override
  String get navDashboard => 'Panou principal';

  @override
  String get navBikes => 'Flotă';

  @override
  String get navCustomers => 'Clienți';

  @override
  String get navRentals => 'Închirieri';

  @override
  String get navMore => 'Mai mult';

  @override
  String get navServicing => 'Service';

  @override
  String get navInventory => 'Piese & Stoc';

  @override
  String get navReports => 'Rapoarte';

  @override
  String get navSettings => 'Setări';

  @override
  String get commonSave => 'Salvează';

  @override
  String get commonCancel => 'Anulează';

  @override
  String get commonConfirm => 'Confirmă';

  @override
  String get commonDelete => 'Șterge';

  @override
  String get commonEdit => 'Editează';

  @override
  String get commonArchive => 'Arhivează';

  @override
  String get commonUnarchive => 'Restaurează';

  @override
  String get commonSearch => 'Căutare...';

  @override
  String get commonFilter => 'Filtru';

  @override
  String get commonDetails => 'Detalii';

  @override
  String get commonNotes => 'Note / Observații';

  @override
  String get commonStatus => 'Stare';

  @override
  String get commonCurrency => 'Monedă';

  @override
  String get commonAmount => 'Sumă';

  @override
  String get commonDate => 'Dată';

  @override
  String get commonTotal => 'Total';

  @override
  String get commonActions => 'Acțiuni';

  @override
  String get commonSuccess => 'Operațiunea a fost finalizată cu succes';

  @override
  String get commonError => 'A apărut o eroare. Vă rugăm să reîncercați.';

  @override
  String get kpiActiveRentals => 'Închirieri active';

  @override
  String get kpiAvailableBikes => 'Motociclete disponibile';

  @override
  String get kpiInService => 'În mentenanță';

  @override
  String get kpiFleetSize => 'Total flotă';

  @override
  String get kpiOverdueRent => 'Chirii scadente / restante';

  @override
  String get kpiLowStockAlerts => 'Alerte stoc scăzut';

  @override
  String get kpiMonthlyRevenue => 'Venituri lunare';

  @override
  String get statusAvailable => 'Disponibilă';

  @override
  String get statusRented => 'Închiriată';

  @override
  String get statusInService => 'În service';

  @override
  String get statusInactive => 'Inactivă';

  @override
  String get statusActive => 'Activ';

  @override
  String get statusClosed => 'Încheiat';

  @override
  String get statusCancelled => 'Anulat';

  @override
  String get statusUnpaid => 'Neplătită';

  @override
  String get statusPartiallyPaid => 'Achitată parțial';

  @override
  String get statusPaid => 'Achitată';

  @override
  String get statusConfirmed => 'Confirmată';

  @override
  String get statusReversed => 'Stornată';

  @override
  String get bikeTitle => 'Flotă Motociclete';

  @override
  String get bikeAdd => 'Adaugă motocicletă';

  @override
  String get bikePlate => 'Număr înmatriculare';

  @override
  String get bikeVin => 'Serie șasiu (VIN)';

  @override
  String get bikeMake => 'Marcă';

  @override
  String get bikeModel => 'Model';

  @override
  String get bikeYear => 'An fabricație';

  @override
  String get bikeOdometer => 'Kilometraj (km)';

  @override
  String get bikeItp => 'Expirare ITP';

  @override
  String get bikeRca => 'Expirare RCA';

  @override
  String get bikeCasco => 'Expirare CASCO';

  @override
  String get customerTitle => 'Clienți';

  @override
  String get customerAdd => 'Înregistrare client';

  @override
  String get customerName => 'Nume și prenume';

  @override
  String get customerPhone => 'Număr de telefon';

  @override
  String get customerCnp => 'CNP / Cod Fiscal';

  @override
  String get customerLicence => 'Permis conducere #';

  @override
  String get customerLicenceCat => 'Categorii permis (ex: A, A2, B)';

  @override
  String get customerLicenceExpiry => 'Expirare permis';

  @override
  String get customerAddress => 'Adresă domiciliu';

  @override
  String get customerBalance => 'Solduri financiare';

  @override
  String get rentalTitle => 'Contracte Închiriere';

  @override
  String get rentalCreate => 'Contract nou';

  @override
  String get rentalClose => 'Închide contract';

  @override
  String get rentalStartDate => 'Dată început';

  @override
  String get rentalEndDate => 'Dată estimată sfârșit';

  @override
  String get rentalWeeklyRate => 'Chirie săptămânală';

  @override
  String get rentalDeposit => 'Garanție depozit';

  @override
  String get rentalClosureDate => 'Dată efectivă predare';

  @override
  String get rentalDepositDisposition => 'Tratament garanție';

  @override
  String get rentalCharges => 'Grafic de plată chirii';

  @override
  String get rentalChargeSeq => 'Săptămâna';

  @override
  String get paymentTitle => 'Plăți și Încasări';

  @override
  String get paymentRecord => 'Înregistrează plată';

  @override
  String get paymentReverse => 'Stornează plată';

  @override
  String get paymentReverseReason => 'Motiv stornare';

  @override
  String get paymentMethod => 'Metodă de plată';

  @override
  String get paymentMethodCash => 'Numerar';

  @override
  String get paymentMethodBank => 'Transfer bancar';

  @override
  String get paymentMethodCard => 'Card bancar';

  @override
  String get paymentReference => 'Chitanță / Ref #';

  @override
  String get paymentAllocationMode => 'Mod alocare';

  @override
  String get paymentAutoFifo => 'Automat (prima chirie scadentă)';

  @override
  String get paymentManual => 'Selectare manuală tranșe';

  @override
  String get serviceTitle => 'Mentenanță și Service';

  @override
  String get serviceLog => 'Înregistrare revizie';

  @override
  String get serviceProvider => 'Atelier / Furnizor';

  @override
  String get serviceWork => 'Lucrări efectuate';

  @override
  String get serviceLabour => 'Cost manoperă';

  @override
  String get serviceParts => 'Piese înlocuite';

  @override
  String get serviceNextDue => 'Următoarea revizie';

  @override
  String get inventoryTitle => 'Gestiune Piese de Schimb';

  @override
  String get inventoryPartAdd => 'Adaugă piesă';

  @override
  String get inventoryPartCode => 'Cod piesă';

  @override
  String get inventoryPartName => 'Denumire piesă';

  @override
  String get inventoryCategory => 'Categorie';

  @override
  String get inventoryCurrentStock => 'Cantitate în stoc';

  @override
  String get inventoryMinLevel => 'Nivel minim alertă';

  @override
  String get inventoryUnitCost => 'Preț unitar';

  @override
  String get inventoryUnitMeasure => 'Unitate';

  @override
  String get inventoryStockMove => 'Mișcare de stoc';

  @override
  String get inventoryStockIn => 'Intrare stoc (achiziție)';

  @override
  String get inventoryStockOut => 'Ieșire stoc (consum/casare)';

  @override
  String get reportTitle => 'Analize Financiare și Flotă';

  @override
  String get reportUtilization => 'Grad de utilizare flotă';

  @override
  String get reportBikeRoi => 'Rentabilitate per motocicletă (ROI)';

  @override
  String get settingsTitle => 'Setări';

  @override
  String get settingsLanguage => 'Limbă aplicație';

  @override
  String get settingsLanguageEn => 'Engleză (Implicit)';

  @override
  String get settingsLanguageRo => 'Română';

  @override
  String get settingsTheme => 'Temă interfață';

  @override
  String get settingsThemeDark => 'Mod întunecat';

  @override
  String get settingsThemeLight => 'Mod luminos';

  @override
  String get settingsServerUrl => 'URL Server API';
}

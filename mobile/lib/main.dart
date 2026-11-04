import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'features/auth/providers/auth_provider.dart';
import 'l10n/app_localizations.dart';
import 'router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return Material(
      color: const Color(0xFF0F172A),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'The app could not start.\n\n${details.exception}',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 16),
          ),
        ),
      ),
    );
  };
  runApp(const ProviderScope(child: MotoRentalApp()));
}

class MotoRentalApp extends ConsumerWidget {
  const MotoRentalApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final authState = ref.watch(authProvider);

    return MaterialApp.router(
      title: 'MotoRental Pro',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: authState.themeMode,
      locale: authState.locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}

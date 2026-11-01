import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/api/api_endpoints.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final authState = ref.watch(authProvider);
    final currentLanguage = authState.locale.languageCode;
    final currentCurrency = authState.currency;
    final isDarkMode = authState.themeMode == ThemeMode.dark;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Section: Localization
          Text(
            l10n.settingsLanguage,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Theme.of(
                  context,
                ).colorScheme.outlineVariant.withAlpha(80),
              ),
            ),
            child: RadioGroup<String>(
              groupValue: currentLanguage,
              onChanged: (val) {
                if (val != null) {
                  ref.read(authProvider.notifier).setLanguage(val);
                }
              },
              child: Column(
                children: [
                  RadioListTile<String>(
                    title: Row(
                      children: [
                        const Text('🇬🇧 ', style: TextStyle(fontSize: 18)),
                        Text(l10n.settingsLanguageEn),
                      ],
                    ),
                    subtitle: const Text('Default system language'),
                    value: 'en',
                  ),
                  const Divider(height: 1),
                  RadioListTile<String>(
                    title: Row(
                      children: [
                        const Text('🇷🇴 ', style: TextStyle(fontSize: 18)),
                        Text(l10n.settingsLanguageRo),
                      ],
                    ),
                    subtitle: const Text('Limba română'),
                    value: 'ro',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          Text(
            l10n.commonCurrency,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Theme.of(
                  context,
                ).colorScheme.outlineVariant.withAlpha(80),
              ),
            ),
            child: RadioGroup<String>(
              groupValue: currentCurrency,
              onChanged: (val) {
                if (val != null) {
                  ref.read(authProvider.notifier).setCurrency(val);
                }
              },
              child: Column(
                children: [
                  for (final currency in ['RON', 'EUR', 'USD'])
                    RadioListTile<String>(
                      title: Text(currency),
                      subtitle: Text(
                        'Use $currency for revenue and payment totals',
                      ),
                      value: currency,
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Section: Appearance
          Text(
            l10n.settingsTheme,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Theme.of(
                  context,
                ).colorScheme.outlineVariant.withAlpha(80),
              ),
            ),
            child: SwitchListTile(
              secondary: Icon(
                isDarkMode ? Icons.dark_mode : Icons.light_mode,
                color: Theme.of(context).colorScheme.primary,
              ),
              title: Text(
                isDarkMode ? l10n.settingsThemeDark : l10n.settingsThemeLight,
              ),
              subtitle: Text(
                isDarkMode
                    ? 'High contrast dark theme enabled'
                    : 'Crisp daylight light theme enabled',
              ),
              value: isDarkMode,
              onChanged: (_) {
                ref.read(authProvider.notifier).toggleTheme();
              },
            ),
          ),
          const SizedBox(height: 24),

          // Section: API Server Information
          Text(
            l10n.settingsServerUrl,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Theme.of(
                  context,
                ).colorScheme.outlineVariant.withAlpha(80),
              ),
            ),
            child: ListTile(
              leading: const Icon(Icons.cloud_outlined),
              title: const Text('Backend API Server'),
              subtitle: Text(ApiEndpoints.defaultBaseUrl),
              trailing: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.green.withAlpha(30),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'Connected',
                  style: TextStyle(
                    color: Colors.green,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 32),

          // About Section
          Center(
            child: Column(
              children: [
                Text(
                  l10n.appTitle,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'v1.0.0 — Production Build (Romania Fleet Edition)',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            icon: const Icon(Icons.logout),
            label: Text(l10n.logout),
            onPressed: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: Text(l10n.logout),
                  content: Text(l10n.logoutConfirm),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: Text(l10n.commonCancel),
                    ),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red,
                      ),
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: Text(l10n.logout),
                    ),
                  ],
                ),
              );

              if (confirm == true) {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              }
            },
          ),
        ],
      ),
    );
  }
}

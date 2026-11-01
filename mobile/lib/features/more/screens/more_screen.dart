import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/widgets/app_scaffold.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final authState = ref.watch(authProvider);
    final user = authState.user;

    return AppScaffold(
      selectedIndex: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.navMore),
        ),
        body: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            // User Header Profile Card
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Card(
                elevation: 0,
                color: Theme.of(context).colorScheme.surfaceContainerHighest.withAlpha(120),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 26,
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        child: Text(
                          user != null && user.fullName.isNotEmpty
                              ? user.fullName[0].toUpperCase()
                              : 'O',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.fullName ?? 'Fleet Owner',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              user?.email ?? '',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Modules
            _buildNavTile(
              context,
              icon: Icons.payments_outlined,
              title: l10n.paymentTitle,
              subtitle: 'Track rent collections, receipts & reversals',
              onTap: () => context.push('/payments'),
            ),
            _buildNavTile(
              context,
              icon: Icons.build_outlined,
              title: l10n.navServicing,
              subtitle: 'Maintenance logs, workshops & scheduled revisions',
              onTap: () => context.push('/servicing'),
            ),
            _buildNavTile(
              context,
              icon: Icons.inventory_2_outlined,
              title: l10n.navInventory,
              subtitle: 'Spare-parts catalog, stock levels & low-stock alerts',
              onTap: () => context.push('/inventory'),
            ),
            _buildNavTile(
              context,
              icon: Icons.insights_outlined,
              title: l10n.navReports,
              subtitle: 'Fleet utilization & per-motorbike profit/ROI',
              onTap: () => context.push('/reports'),
            ),
            const Divider(height: 24),
            _buildNavTile(
              context,
              icon: Icons.settings_outlined,
              title: l10n.navSettings,
              subtitle: 'Language, theme & connection settings',
              onTap: () => context.push('/settings'),
            ),

            const SizedBox(height: 16),
            // Log Out Button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OutlinedButton.icon(
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
                    builder: (ctx) => AlertDialog(
                      title: Text(l10n.logout),
                      content: Text(l10n.logoutConfirm),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: Text(l10n.commonCancel),
                        ),
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: Colors.red),
                          onPressed: () => Navigator.pop(ctx, true),
                          child: Text(l10n.logout),
                        ),
                      ],
                    ),
                  );

                  if (confirm == true) {
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) {
                      context.go('/login');
                    }
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primaryContainer.withAlpha(100),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: Theme.of(context).colorScheme.primary),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.arrow_forward_ios, size: 14),
      onTap: onTap,
    );
  }
}


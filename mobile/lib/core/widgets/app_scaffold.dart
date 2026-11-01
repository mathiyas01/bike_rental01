import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';

class AppScaffold extends StatelessWidget {
  final Widget child;
  final int selectedIndex;

  const AppScaffold({
    super.key,
    required this.child,
    required this.selectedIndex,
  });

  void _onItemTapped(int index, BuildContext context) {
    switch (index) {
      case 0:
        context.go('/dashboard');
        break;
      case 1:
        context.go('/bikes');
        break;
      case 2:
        context.go('/customers');
        break;
      case 3:
        context.go('/rentals');
        break;
      case 4:
        context.go('/more');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: selectedIndex,
        onTap: (index) => _onItemTapped(index, context),
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.dashboard_outlined),
            activeIcon: const Icon(Icons.dashboard),
            label: l10n.navDashboard,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.two_wheeler_outlined),
            activeIcon: const Icon(Icons.two_wheeler),
            label: l10n.navBikes,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.people_alt_outlined),
            activeIcon: const Icon(Icons.people_alt),
            label: l10n.navCustomers,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.description_outlined),
            activeIcon: const Icon(Icons.description),
            label: l10n.navRentals,
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.more_horiz),
            activeIcon: const Icon(Icons.more_horiz_outlined),
            label: l10n.navMore,
          ),
        ],
      ),
    );
  }
}

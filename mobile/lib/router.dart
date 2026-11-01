import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'features/auth/providers/auth_provider.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/dashboard/screens/dashboard_screen.dart';
import 'features/bikes/screens/bike_list_screen.dart';
import 'features/bikes/screens/add_bike_screen.dart';
import 'features/bikes/screens/bike_detail_screen.dart';
import 'features/customers/screens/customer_list_screen.dart';
import 'features/customers/screens/add_customer_screen.dart';
import 'features/customers/screens/customer_detail_screen.dart';
import 'features/rentals/screens/rental_list_screen.dart';
import 'features/rentals/screens/create_rental_screen.dart';
import 'features/rentals/screens/rental_detail_screen.dart';
import 'features/payments/screens/payment_list_screen.dart';
import 'features/payments/screens/record_payment_screen.dart';
import 'features/servicing/screens/service_list_screen.dart';
import 'features/servicing/screens/log_service_screen.dart';
import 'features/inventory/screens/inventory_screen.dart';
import 'features/inventory/screens/add_part_screen.dart';
import 'features/reports/screens/reports_screen.dart';
import 'features/more/screens/more_screen.dart';
import 'features/settings/screens/settings_screen.dart';
import 'core/widgets/app_scaffold.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/dashboard',
    redirect: (context, state) {
      final isLoggingIn = state.matchedLocation == '/login';
      final isLoggedIn = authState.isAuthenticated;

      // If user is not logged in and not on login page, redirect to /login
      if (!isLoggedIn && !isLoggingIn) {
        return '/login';
      }

      // If user is logged in and trying to access /login, redirect to /dashboard
      if (isLoggedIn && isLoggingIn) {
        return '/dashboard';
      }

      return null;
    },
    routes: [
      // Auth
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),

      ShellRoute(
        builder: (context, state, child) {
          final path = state.uri.path;
          final selectedIndex = path.startsWith('/bikes')
              ? 1
              : path.startsWith('/rentals')
              ? 2
              : path.startsWith('/inventory')
              ? 3
              : 0;
          return AppScaffold(selectedIndex: selectedIndex, child: child);
        },
        routes: [
          // Dashboard
          GoRoute(
            path: '/dashboard',
            builder: (context, state) => const DashboardScreen(),
          ),

          // Fleet (Bikes)
          GoRoute(
            path: '/bikes',
            builder: (context, state) => const BikeListScreen(),
            routes: [
              GoRoute(
                path: 'add',
                builder: (context, state) => const AddBikeScreen(),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) {
                  final bikeId = state.pathParameters['id']!;
                  return BikeDetailScreen(bikeId: bikeId);
                },
              ),
            ],
          ),

          // Customers
          GoRoute(
            path: '/customers',
            builder: (context, state) => const CustomerListScreen(),
            routes: [
              GoRoute(
                path: 'add',
                builder: (context, state) => AddCustomerScreen(
                  returnToRental:
                      state.uri.queryParameters['fromRental'] == 'true',
                ),
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) {
                  final customerId = state.pathParameters['id']!;
                  return CustomerDetailScreen(customerId: customerId);
                },
              ),
            ],
          ),

          // Rentals
          GoRoute(
            path: '/rentals',
            builder: (context, state) => const RentalListScreen(),
            routes: [
              GoRoute(
                path: 'create',
                builder: (context, state) {
                  final initialCust = state.uri.queryParameters['customerId'];
                  final initialBike = state.uri.queryParameters['bikeId'];
                  return CreateRentalScreen(
                    initialCustomerId: initialCust,
                    initialBikeId: initialBike,
                  );
                },
              ),
              GoRoute(
                path: ':id',
                builder: (context, state) {
                  final rentalId = state.pathParameters['id']!;
                  return RentalDetailScreen(rentalId: rentalId);
                },
              ),
            ],
          ),

          // Payments
          GoRoute(
            path: '/payments',
            builder: (context, state) => const PaymentListScreen(),
            routes: [
              GoRoute(
                path: 'record',
                builder: (context, state) {
                  final custId = state.uri.queryParameters['customerId'];
                  final rentId = state.uri.queryParameters['rentalId'];
                  return RecordPaymentScreen(
                    preselectedCustomerId: custId,
                    preselectedRentalId: rentId,
                  );
                },
              ),
            ],
          ),

          // Servicing
          GoRoute(
            path: '/servicing',
            builder: (context, state) => const ServiceListScreen(),
            routes: [
              GoRoute(
                path: 'log',
                builder: (context, state) {
                  final bikeId = state.uri.queryParameters['bikeId'];
                  return LogServiceScreen(preselectedBikeId: bikeId);
                },
              ),
            ],
          ),

          // Inventory
          GoRoute(
            path: '/inventory',
            builder: (context, state) => const InventoryScreen(),
            routes: [
              GoRoute(
                path: 'add',
                builder: (context, state) => const AddPartScreen(),
              ),
            ],
          ),

          // Reports
          GoRoute(
            path: '/reports',
            builder: (context, state) => const ReportsScreen(),
          ),

          // More
          GoRoute(
            path: '/more',
            builder: (context, state) => const MoreScreen(),
          ),

          // Settings
          GoRoute(
            path: '/settings',
            builder: (context, state) => const SettingsScreen(),
          ),
        ],
      ),
    ],
  );
});

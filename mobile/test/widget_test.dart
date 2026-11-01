import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:motorbike_rental_app/main.dart';

void main() {
  testWidgets('App root initializes properly', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MotoRentalApp(),
      ),
    );

    // Initial frame pump
    await tester.pump();

    // Verify MotoRentalApp is in the widget tree
    expect(find.byType(MotoRentalApp), findsOneWidget);
  });
}

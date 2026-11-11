# Stage B: API compatibility strategy

## Compatibility principles

The Firebase Express app is a transport replacement, not a client redesign.
All 61 Java routes remain under `/api/v1`, with the same HTTP method, path
parameters, query names, request property names, response property names,
status codes, date formats, pagination envelope, and authentication contract.
The Stage A matrix is the authoritative route inventory.

## Controller/service mapping

| Routes | Firebase controller | Domain service | Main repository/read model |
|---|---|---|---|
| 1-6 `/auth/*` | `authController` | `authService` | users, unique email |
| 7-13 `/bikes/*` | `bikeController` | `bikeService` | bikes, unique registration/VIN |
| 14-20 `/customers/*` | `customerController` | `customerService` | customers, unique phone, balance summary |
| 21-25 `/rentals/*` | `rentalController` | `rentalService` | rentals, bikes, customers, active locks |
| 26-30 `/rental-charges/*` | `rentalChargeController` | `rentalChargeService` | charges, rental sequence cursor |
| 31-37 `/payments/*` | `paymentController` | `paymentService` | payments, allocations, charges, reversals |
| 38-44 `/parts/*` | `partController` | `partService` | parts, suppliers, low-stock read model |
| 45-47 `/stock-movements/*` | `stockMovementController` | `stockMovementService` | parts, immutable movements |
| 48-52 `/suppliers/*` | `supplierController` | `supplierService` | suppliers |
| 53-57 `/services/*` | `servicingController` | `servicingService` | services, usage, parts, bikes, movements |
| 58-61 `/reports/*` | `reportController` | `reportService` | summary documents plus source queries |

This mapping covers every endpoint, including routes not currently called by
the primary screens.

## Complete 61-endpoint controller/service map

| # | Method and path | Controller | Service |
|---:|---|---|---|
| 1 | `POST /api/v1/auth/login` | authController | authService |
| 2 | `POST /api/v1/auth/reset-password` | authController | authService |
| 3 | `POST /api/v1/auth/bootstrap-owner` | authController | authService |
| 4 | `GET /api/v1/auth/profile` | authController | authService |
| 5 | `PATCH /api/v1/auth/profile/language` | authController | authService |
| 6 | `PATCH /api/v1/auth/profile/currency` | authController | authService |
| 7 | `POST /api/v1/bikes` | bikeController | bikeService |
| 8 | `GET /api/v1/bikes` | bikeController | bikeService |
| 9 | `GET /api/v1/bikes/{id}` | bikeController | bikeService |
| 10 | `PUT /api/v1/bikes/{id}` | bikeController | bikeService |
| 11 | `PATCH /api/v1/bikes/{id}/status` | bikeController | bikeService |
| 12 | `POST /api/v1/bikes/{id}/archive` | bikeController | bikeService |
| 13 | `POST /api/v1/bikes/{id}/unarchive` | bikeController | bikeService |
| 14 | `POST /api/v1/customers` | customerController | customerService |
| 15 | `GET /api/v1/customers` | customerController | customerService |
| 16 | `GET /api/v1/customers/{id}` | customerController | customerService |
| 17 | `PUT /api/v1/customers/{id}` | customerController | customerService |
| 18 | `POST /api/v1/customers/{id}/archive` | customerController | customerService |
| 19 | `POST /api/v1/customers/{id}/unarchive` | customerController | customerService |
| 20 | `GET /api/v1/customers/{id}/balance-summary` | customerController | paymentService |
| 21 | `POST /api/v1/rentals` | rentalController | rentalService |
| 22 | `POST /api/v1/rentals/{id}/close` | rentalController | rentalService |
| 23 | `PUT /api/v1/rentals/{id}` | rentalController | rentalService |
| 24 | `GET /api/v1/rentals/{id}` | rentalController | rentalService |
| 25 | `GET /api/v1/rentals` | rentalController | rentalService |
| 26 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-next` | rentalChargeController | rentalChargeService |
| 27 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-up-to-date` | rentalChargeController | rentalChargeService |
| 28 | `GET /api/v1/rental-charges/rental/{rentalId}` | rentalChargeController | rentalChargeService |
| 29 | `GET /api/v1/rental-charges/due` | rentalChargeController | rentalChargeService |
| 30 | `GET /api/v1/rental-charges` | rentalChargeController | rentalChargeService |
| 31 | `POST /api/v1/payments` | paymentController | paymentService |
| 32 | `POST /api/v1/payments/{id}/reverse` | paymentController | paymentService |
| 33 | `GET /api/v1/payments/{id}` | paymentController | paymentService |
| 34 | `GET /api/v1/payments` | paymentController | paymentService |
| 35 | `GET /api/v1/payments/customer/{customerId}` | paymentController | paymentService |
| 36 | `GET /api/v1/payments/rental/{rentalId}` | paymentController | paymentService |
| 37 | `GET /api/v1/payments/balance-summary/{customerId}` | paymentController | paymentService |
| 38 | `POST /api/v1/parts` | partController | partService |
| 39 | `PUT /api/v1/parts/{id}` | partController | partService |
| 40 | `GET /api/v1/parts/{id}` | partController | partService |
| 41 | `GET /api/v1/parts` | partController | partService |
| 42 | `GET /api/v1/parts/low-stock` | partController | partService |
| 43 | `POST /api/v1/parts/{id}/archive` | partController | partService |
| 44 | `POST /api/v1/parts/{id}/unarchive` | partController | partService |
| 45 | `POST /api/v1/stock-movements` | stockMovementController | stockMovementService |
| 46 | `GET /api/v1/stock-movements/part/{partId}` | stockMovementController | stockMovementService |
| 47 | `GET /api/v1/stock-movements` | stockMovementController | stockMovementService |
| 48 | `POST /api/v1/suppliers` | supplierController | supplierService |
| 49 | `GET /api/v1/suppliers` | supplierController | supplierService |
| 50 | `GET /api/v1/suppliers/{id}` | supplierController | supplierService |
| 51 | `POST /api/v1/suppliers/{id}/archive` | supplierController | supplierService |
| 52 | `POST /api/v1/suppliers/{id}/unarchive` | supplierController | supplierService |
| 53 | `POST /api/v1/services` | servicingController | servicingService |
| 54 | `GET /api/v1/services/{id}` | servicingController | servicingService |
| 55 | `GET /api/v1/services/bike/{bikeId}` | servicingController | servicingService |
| 56 | `GET /api/v1/services` | servicingController | servicingService |
| 57 | `GET /api/v1/services/due` | servicingController | servicingService |
| 58 | `GET /api/v1/reports/dashboard` | reportController | reportService |
| 59 | `GET /api/v1/reports/fleet-utilization` | reportController | reportService |
| 60 | `GET /api/v1/reports/date-range` | reportController | reportService |
| 61 | `GET /api/v1/reports/bike-roi/{bikeId}` | reportController | reportService |

## Exact route inventory

| # | Method and path | Status/response |
|---:|---|---|
| 1 | `POST /api/v1/auth/login` | 200 `LoginResponse` |
| 2 | `POST /api/v1/auth/reset-password` | 204 empty; production-disabled |
| 3 | `POST /api/v1/auth/bootstrap-owner` | 201 `LoginResponse` |
| 4 | `GET /api/v1/auth/profile` | 200 `UserProfileDto` |
| 5 | `PATCH /api/v1/auth/profile/language` | 200 `UserProfileDto` |
| 6 | `PATCH /api/v1/auth/profile/currency` | 200 `UserProfileDto` |
| 7-13 | `POST/GET/PUT/PATCH/POST/POST /api/v1/bikes[/{id}...]` | 201 create; 200 reads/updates/archive |
| 14-20 | `POST/GET/GET/PUT/POST/POST/GET /api/v1/customers[/{id}...]` | 201 create; 200 others |
| 21-25 | `POST/POST/PUT/GET/GET /api/v1/rentals[/{id}...]` | 201 create; 200 others |
| 26-30 | charge generation and search routes in Stage A matrix | 201 generation; 200 reads |
| 31-37 | payment record/reverse/detail/search/customer/rental/balance routes | 201 record; 200 others |
| 38-47 | parts and stock movement routes in Stage A matrix | 201 creates; 200 reads/updates |
| 48-52 | supplier create/list/detail/archive/unarchive | 201 create; 200 others |
| 53-57 | service create/detail/bike/search/due | 201 create; 200 reads |
| 58-61 | dashboard/utilization/date-range/bike-ROI | 200 |

The compact grouped rows above are only an index; exact paths, parameters, and
DTO fields remain in [the Stage A matrix](./api-compatibility-matrix.md) and
must be copied into route tests one endpoint at a time.

## Individual endpoint contract testing

The Stage A matrix remains authoritative for all 61 endpoints. Stage C must
create one named contract test per numbered row, not only one test per
controller. Each test sends the documented method, exact path, query
parameters, request body, and authentication state to both Java and Firebase,
then compares status, headers relevant to clients, JSON property names/types,
decimal values, dates, error shape, and resulting persisted state. Tests must
cover success, validation, unauthorized, forbidden, not-found, conflict, and
boundary cases appropriate to each endpoint. Grouped smoke tests do not count
as endpoint coverage.

## DTO and status preservation

Define TypeScript request/response schemas from the Java DTOs, not from
Firestore documents. Keep `BigDecimal` JSON serialization compatible with the
current decimal JSON output. Keep `LocalDate` strings and `Instant` output.

Creation returns 201, normal reads/updates return 200, generation endpoints
return 201, and reset-password returns 204. Business exceptions, validation,
unauthorized, forbidden, not-found, conflict, and generic errors are mapped
to the existing `ErrorResponse`. Exact service messages are captured by
differential tests against the Java backend.

## Query parameters and pagination

Parse all endpoint-specific filters listed in the Stage A matrix, including
Spring-style `page`, `size`, and `sort`. Preserve default sizes and sort
directions. Use a stable Firestore cursor and a count/summary source to
construct the legacy `PageResponse`. Reject unsupported sort fields rather than
silently changing ordering.

## Validation and authorization

Schema validators reproduce `@NotNull`, `@NotBlank`, `@Email`, `@Size`,
`@Pattern`, `@DecimalMin`, enum, date, and cross-field validations. Error
entries use the Java field names and messages. Route middleware authenticates
the compatibility JWT and requires the owner role for all protected routes.

## Compatibility test plan

1. Extract route metadata and DTO fixtures from the Java app.
2. Run identical requests against Java/H2 or a controlled PostgreSQL instance
   and Firebase Emulator.
3. Compare status, JSON keys/types, decimal values, dates, error shape, and
   state changes.
4. Run concurrency tests for active rentals, charges, inventory, payments, and
   service parts.
5. Run both mobile and web integration smoke tests against the emulator.
6. Do not call the migration complete until all 61 routes have passing
   contract tests and known differences are approved.

## Known compatibility risks

- Firestore cursor pagination and count aggregation differ internally from
  Spring `Page`; the external envelope must be tested carefully.
- Firestore cannot perform arbitrary joins, so denormalized display fields
  must be kept synchronized.
- The Java report implementation should be covered by golden fixtures; the
  source currently contains a confirmed bike-ROI lookup defect: `ReportService`
  calls `paymentRepository.findAllByRentalIdOrderByPaymentDateDesc(bikeId)`,
  passing the bike UUID to a repository method whose parameter is a rental ID.
  The current Java behavior therefore usually returns no revenue for a bike
  unless IDs happen to overlap. Firebase must reproduce this observed behavior
  for strict parity tests and must not silently correct it. Whether to fix it
  is an explicit post-parity product decision requiring approval and a contract
  change.
- Existing error message text is service-specific and cannot be inferred only
  from controller annotations.

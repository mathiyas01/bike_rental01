# Stage A: Feature inventory

This inventory is based on the implemented source code in `backend/`, `mobile/`,
and `web/`, not only on the original requirements documents. It is an audit
baseline for the Firebase migration. No Firebase implementation has been
started by this stage.

## Audit scope

- Backend: 11 REST controllers, 11 services, 15 relational tables, 5 Flyway
  migrations, DTO validation, JWT security, exception handling, recurring
  charge generation, and service scheduling workflows.
- Mobile: Riverpod providers and screens for authentication, dashboard, bikes,
  customers, rentals, payments, inventory, servicing, reports, and settings.
- Web: React/Vite pages for login, dashboard, fleet, customers, rentals,
  payments, servicing, inventory, reports, and settings.

## Functional areas

### Authentication and account settings

- Owner login with email/password and BCrypt password verification.
- JWT access token response containing `accessToken`, `tokenType`, `expiresIn`,
  and the user profile.
- One-time owner bootstrap on an empty database.
- Development password-reset endpoint.
- Authenticated profile retrieval.
- Authenticated preferred language (`en`/`ro`) update.
- Authenticated preferred currency (`RON`/`EUR`/`USD`) update.
- Stateless security; all endpoints except login and bootstrap require a valid
  JWT. The reset-password endpoint is implemented but is not publicly permitted
  by `SecurityConfig`.
- Frontends persist the JWT as `jwt_token` and send it as a Bearer token.

### Motorbike fleet

- Create, list, search, filter by status, and retrieve motorbikes.
- Update motorbike identity, odometer, compliance dates, service interval,
  status, and notes.
- Explicit status changes using `AVAILABLE`, `RENTED`, `IN_SERVICE`, or
  `INACTIVE`.
- Soft archive/unarchive behavior. Archive sets the bike status to `INACTIVE`
  and preserves history.
- ITP, RCA, and CASCO expiry dates.
- Service schedule fields: interval days and next service due date.
- Unique registration number and VIN constraints.

### Customers

- Create, list, search, retrieve, and update customer records.
- Identity and contact fields: full name, phone, email, CNP/tax ID, address,
  living city, date of birth, and notes.
- Driving licence number, categories, and expiry tracking.
- GDPR consent date.
- Soft archive/unarchive while preserving rental and financial history.
- Currency-separated balance summary.
- Unique phone constraint.

### Rentals and recurring charges

- Create a rental agreement connecting one customer to one motorbike.
- Weekly rate, rental currency, deposit amount/currency, planned end date,
  schedule anchor, terms, and notes.
- Active rental allocation changes the motorbike lifecycle and creates the
  initial weekly charge.
- One active rental per bike is enforced by a partial unique database index.
- Retrieve, list, filter by status/customer/bike, and update active rentals.
- Close a rental with closure date and notes; the bike becomes available again.
- Rental statuses are `ACTIVE`, `CLOSED`, and `CANCELLED`.
- Generate the next weekly charge or all missing charges up to a target date.
- List charges for a rental, list due/overdue charges as of a date, and search
  charges by status/currency/customer/rental.
- Charge statuses are `UNPAID`, `PARTIALLY_PAID`, `PAID`, and `CANCELLED`.
- Rental charge sequence is unique per rental.
- Charge responses expose paid and remaining amounts.

### Payments

- Record positive manual payments for `CASH` or `BANK_TRANSFER`.
- Link a payment to a customer and optionally a rental.
- Allocate payments automatically using FIFO (`AUTO_FIFO`) or manually using
  charge IDs and amounts.
- Preserve payment currency isolation; allocations carry their currency.
- Payment history by ID, customer, rental, and filters.
- Reverse a payment with a required reason. Reversal restores outstanding
  charge debt and records an audit row.
- Payment statuses are `CONFIRMED` and `REVERSED`.
- Balance summaries expose billed, paid, and outstanding amounts independently
  for RON, EUR, and USD.

### Spare-parts inventory

- Create and update a parts catalogue.
- Part code, category, unit of measure, reorder level, default cost/currency,
  and optional supplier.
- Initial stock is recorded through the stock ledger.
- List/search/filter parts, including low-stock-only and archived inclusion.
- Low-stock endpoint based on current quantity <= minimum reorder level.
- Soft archive/unarchive parts.
- Record stock-in, stock-out, service usage, return, adjustment, and reversal
  movements.
- Immutable stock movement history by part and across the inventory.
- Stock quantity cannot become negative.
- Stock movement records preserve reference type/id, reason, unit cost,
  currency, and recording user.
- Stock operations are transactional with the part quantity update.

### Suppliers

- Create, list, search, retrieve, archive, and unarchive suppliers.
- Supplier contact, tax, address, and notes fields.
- Parts may retain a nullable default supplier reference.

### Servicing

- Log a service for a motorbike with service date, odometer, provider, work
  performed, labour cost/currency, status, next due date/odometer, notes, and
  parts used.
- Service statuses are `PLANNED`, `IN_PROGRESS`, `COMPLETED`, and `CANCELLED`.
- Service part usage records quantity, unit cost, currency, and calculated cost.
- Completed service usage deducts inventory atomically and creates
  `SERVICE_USAGE` ledger entries.
- Bike odometer is synchronized from the service reading.
- Retrieve a service, list service history by bike, search/filter services, and
  list due services.
- Service responses include parts used, parts cost, labour cost, and total cost.

### Reports and analytics

- Dashboard KPIs: active rentals, available/in-service/total fleet,
  overdue charges, low-stock parts, monthly revenue, and monthly expenses.
- Fleet utilization counts and utilization rate.
- Date-range report for rentals, revenue, service count, labour/parts cost,
  stock quantities, and stock-in/out costs, separated by currency.
- Per-bike ROI: total rental revenue, maintenance cost, and net profit by
  currency.

### Cross-cutting behavior

- ISO date values for `LocalDate`; ISO timestamps for `Instant`.
- Monetary values use decimal `BigDecimal` semantics and are never mixed across
  currencies.
- List endpoints return a Spring `PageResponse`:
  `content`, `pageNumber`, `pageSize`, `totalElements`, `totalPages`, `last`.
- Default pagination is page 0, size 20, with endpoint-specific sort order.
- Validation errors return `status`, `error`, `message`, `path`, `timestamp`, and
  `validationErrors[]` entries containing `field`, `rejectedValue`, and
  `message`.
- Business errors preserve the structured `ErrorResponse` shape.
- CORS currently allows all origins and credentials in the Java configuration;
  production Firebase configuration must replace this with explicit origins.

## Client dependency mapping

### Mobile

The mobile app uses the REST API through
[`api_client.dart`](../../mobile/lib/core/api/api_client.dart), with endpoint
constants in [`api_endpoints.dart`](../../mobile/lib/core/api/api_endpoints.dart).
It directly depends on login/profile, bikes, customers, rentals and rental
charges, payments, parts and stock movements, services, dashboard reports,
fleet utilization, and per-bike ROI. The app expects the existing JWT and
structured error message behavior.

### Web

The web app uses Axios in [`api.ts`](../../web/src/api.ts) and stores the JWT in
`localStorage`. [`App.tsx`](../../web/src/App.tsx) consumes the same list
envelope and endpoint paths for all CRUD pages, rental/payment/service/
inventory workflows, reports, and settings. The only intended migration
configuration change is the API base URL.

## Relational schema audit

The five Flyway migrations currently define 15 tables:

1. `app_users` — owner credentials, role, language, currency, active state.
2. `customers` — contact, identity, licence, GDPR, archive state.
3. `bikes` — fleet identity, odometer, compliance, service schedule, status.
4. `suppliers` — supplier directory and active state.
5. `parts` — catalogue, quantity, reorder level, cost, supplier reference.
6. `rentals` — customer/bike contract and lifecycle.
7. `rental_charges` — recurring weekly debt schedule.
8. `payments` — recorded payments and status.
9. `payment_allocations` — payment-to-charge allocations.
10. `payment_reversals` — one audit row per reversal.
11. `rental_adjustments` — discounts, fees, damage charges, and waivers.
12. `service_records` — maintenance records and schedules.
13. `service_part_usage` — parts consumed by a service.
14. `stock_movements` — immutable inventory ledger.
15. `business_settings` — key/value settings table.

Important relational constraints include unique customer phone, unique bike
registration/VIN, one active rental per bike, unique charge sequence per rental,
foreign-key restrict behavior for financial history, non-negative stock, and
currency/status check constraints.

## Authentication and authorization audit

`SecurityConfig` permits only `POST /api/v1/auth/login` and
`POST /api/v1/auth/bootstrap-owner` without authentication. All other routes
require a stateless JWT. Passwords are BCrypt-hashed with strength 12. The
token contains the owner identity used by the controllers for audit fields.

The Firebase design must therefore retain the current login response and Bearer
token compatibility, or provide a compatibility verification layer without
changing either client.

## Migration risks identified in Stage A

1. Firestore does not provide SQL partial unique indexes; the active-rental-per-
   bike invariant needs a transaction or a dedicated allocation document.
2. Payment allocation, reversal, and charge status updates must remain atomic.
3. Service logging and stock deduction must be one transaction, including
   insufficient-stock rejection.
4. Firestore numeric representation and decimal rounding must preserve the
   current two-decimal monetary behavior.
5. Existing UUIDs and ISO date/timestamp values must be preserved during import.
6. The current schema contains `rental_adjustments` and `business_settings`
   even though no REST controller exposes them; migration must preserve them.
7. Firestore query/index design must cover every list filter and sort combination.
8. The reset-password endpoint is intentionally documented as a development
   helper and must not be accidentally exposed in production.
9. Existing web/mobile clients have hard-coded fallback URLs; production
   switching requires explicit base-URL configuration and approval.
10. Exact parity still requires differential API tests against representative
    PostgreSQL data; this Stage A document does not claim Firebase parity.

## Source references

- Backend controllers: `backend/src/main/java/ro/bikerental/modules/**/controller`
- Backend services: `backend/src/main/java/ro/bikerental/modules/**/service`
- DTOs and validation: `backend/src/main/java/ro/bikerental/modules/**/dto`
- Security: `backend/src/main/java/ro/bikerental/common/security`
- Error contract: `backend/src/main/java/ro/bikerental/common/exception`
- Schema: `backend/src/main/resources/db/migration/V1__init_schema.sql` through
  `V5__add_bike_service_schedule.sql`
- Mobile API/client: `mobile/lib/core/api`
- Web API/client: `web/src/api.ts` and `web/src/App.tsx`

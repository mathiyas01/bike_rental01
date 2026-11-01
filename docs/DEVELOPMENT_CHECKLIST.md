# Motorbike Rental Management System — Development Checklist & Roadmap

## Phase 1: Requirements, System Design & Architecture [COMPLETED]
- [x] Workspace inspection (Confirmed Windows environment, Java 25, Maven 3.9, Flutter 3.38, PostgreSQL 18).
- [x] Verified running PostgreSQL 18 instance on port 5432 and initialized database `bike_rental_db`.
- [x] Created `docs/ARCHITECTURE.md` (Modular monolith, Spring Boot 3.4.x, Riverpod Flutter app).
- [x] Created `docs/REQUIREMENTS_SPECIFICATION.md` (Domain model, multi-currency isolation rules, business assumptions).
- [x] Created `docs/DATABASE_DESIGN.md` (Normalized ER diagram, constraints, Flyway V1 schema).
- [x] Created `docs/API_SPECIFICATION.md` (RESTful endpoint contracts, DTO payloads, error model).
- [x] Created `docs/FLUTTER_NAVIGATION_PLAN.md` (Navigation tree, screen flows, RO/EN localization).
- [x] Formulated key business assumptions for owner confirmation.

---

## Phase 2: Backend Foundation & Core Fleet/Customer APIs [COMPLETED]
- [x] Initialize Spring Boot 3.4.x project in `backend/` with Maven wrapper.
- [x] Configure `application.yml` and `application-dev.yml` for PostgreSQL 18.
- [x] Add Flyway migration scripts (`V1__init_schema.sql` and `V2__seed_initial_data.sql`).
- [x] Implement Common module:
  - [x] Multi-currency value objects and enums (`SupportedCurrency`: RON, EUR, USD).
  - [x] Global exception handling with RFC 7807 problem details.
  - [x] Standard pagination and API response wrappers.
- [x] Implement Security & Auth module:
  - [x] `AppUser` entity and repository.
  - [x] Password encoder (BCrypt strength 12).
  - [x] JWT token provider and security filter.
  - [x] `POST /api/v1/auth/login` and `GET /api/v1/auth/profile`.
- [x] Implement Motorbike Fleet module:
  - [x] `Motorbike` entity, repository, and DTOs.
  - [x] CRUD operations with registration plate and VIN uniqueness checks.
  - [x] Status lifecycle management (`AVAILABLE`, `RENTED`, `IN_SERVICE`, `INACTIVE`).
- [x] Implement Customer module:
  - [x] `Customer` entity, repository, and DTOs.
  - [x] Driving license tracking and GDPR soft-archive.
- [x] Write Automated Backend Tests:
  - [x] `AuthServiceTest` (token generation, bad password rejection).
  - [x] `MotorbikeServiceTest` (duplicate plate prevention, status transitions).
  - [x] `CustomerServiceTest` (validation, soft-archive).

---

## Phase 3: Rentals, Recurring Charges & Multi-Currency Payments [COMPLETED]
- [x] Implement Rental Agreement module:
  - [x] `Rental` entity and repository.
  - [x] Overlapping rental prevention (partial unique index and service check).
  - [x] Automatic motorbike status update (`AVAILABLE` -> `RENTED`).
- [x] Implement Weekly Charge Generation Engine:
  - [x] `RentalCharge` entity and repository.
  - [x] Scheduled / on-demand charge calculator for weekly periods.
  - [x] Immutable historical charges safeguard.
- [x] Implement Payment & Allocation Ledger:
  - [x] `Payment`, `PaymentAllocation`, and `PaymentReversal` entities.
  - [x] Strict currency validation (`payment.currency == charge.currency`).
  - [x] Auto-FIFO allocation engine and manual charge allocation.
  - [x] Overdue charge query and outstanding balance calculator.
  - [x] Payment reversal transaction with audit reason.
- [x] Write Automated Accounting & Payment Tests:
  - [x] Test separate RON, EUR, USD balances (verify no cross-currency leakage).
  - [x] Test partial payments and overpayment rejection.
  - [x] Test FIFO allocation across multiple overdue charges.
  - [x] Test payment reversal restores unpaid charge status.

---

## Phase 4: Servicing & Spare-Parts Inventory Ledger [COMPLETED]
- [x] Implement Inventory & Parts module:
  - [x] `Part` entity and repository.
  - [x] Stock movement immutable ledger (`StockMovement` entity).
  - [x] Atomic stock update with negative quantity check (`quantity >= 0`).
  - [x] Low-stock threshold alerts (`current_quantity <= min_reorder_level`).
- [x] Implement Bike Servicing module:
  - [x] `ServiceRecord` and `ServicePartUsage` entities.
  - [x] Service lifecycle (`PLANNED` -> `IN_PROGRESS` -> `COMPLETED`).
  - [x] Transactional parts consumption (deducts stock and logs movements in same TX).
  - [x] Rollback verification if parts stock is insufficient.
  - [x] Bike status transition to `IN_SERVICE` and back to `AVAILABLE`.
- [x] Write Automated Inventory Tests:
  - [x] Test atomic stock deduction.
  - [x] Test `InsufficientStockException` on zero/negative stock.
  - [x] Test rollback integrity on service failure.
  - [x] Test concurrency safety on stock updates.

---

## Phase 5: Flutter Mobile Application [COMPLETED]
- [x] Initialize Flutter 3.38 project in `mobile/`.
- [x] Configure dependencies (`flutter_riverpod: 2.6.1`, `dio`, `go_router`, `flutter_secure_storage`, `intl: 0.20.2`).
- [x] Set up theme, custom color palette, Material 3 styling, and Inter Google Fonts.
- [x] Set up English (`app_en.arb`, default) and Romanian (`app_ro.arb`) localization files.
- [x] Implement Core Network layer with Dio interceptor for JWT injection and error decoding.
- [x] Build Feature UI Modules:
  - [x] Auth: Login screen and secure token storage.
  - [x] Navigation shell with bottom navigation bar and More menu.
  - [x] Dashboard: Multi-currency KPI cards, fleet overview, operational alerts.
  - [x] Motorbikes: List with status filters, registration form, detail view with history.
  - [x] Customers: List, search, add/edit form, active rental link, multi-currency balance cards.
  - [x] Rentals: Contract wizard, charge schedule viewer, deposit settlement modal.
  - [x] Payments: Payment collection sheet, charge selector, receipt card, reversal modal.
  - [x] Servicing: Service log, parts picker, workshop entry, next revision threshold.
  - [x] Inventory: Parts list, low-stock chips, stock-in/out dialogs, movement history.
  - [x] Reports: Fleet utilization rate bar, per-bike profitability (ROI) in RON, EUR, USD.
  - [x] Settings: Instant English/Romanian switcher, Dark/Light theme mode, API endpoint selector.
- [x] Automated Verification:
  - [x] `flutter analyze`: Passed with 0 errors, 0 warnings.
  - [x] `flutter test`: Passed with 0 failures.
  - [x] `mvn test`: 44 backend integration and unit tests passing with 0 failures, 0 errors.

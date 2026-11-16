# Stage C8.2 – Final API & Compatibility Review

**Review Date:** 2026-11-16  
**Scope:** Read-only audit of `backend-firebase/` (all 61 migrated routes across Stages C1–C8.1) against authoritative Java Spring Boot `backend/`, migration specifications in `docs/firebase-migration/`, `mobile/` (Flutter), and `web/` (React).  
**Status:** Audit Only — No code, tests, indexes, or client files were modified.

---

## 1. Executive Summary

The `backend-firebase/` migration achieves complete **61/61 route structural coverage** across all 8 Java controllers (`Auth`, `Bikes`, `Customers`, `Rentals & Rental Charges`, `Payments`, `Inventory`, `Servicing`, and `Reports`). Core transactional invariants (`BigInt` fixed-point financial precision, `unique_keys` SHA-256 uniqueness locks, `active_rental_locks` double-booking protection, `AUTO_FIFO`/`MANUAL` payment allocations and reversals, negative-stock protection, `SERVICE_USAGE` atomic ledger deductions, and `PaymentService` balance-summary reuse) are solidly implemented with strict read-before-write transaction ordering.

However, the audit identified **4 Critical** client-breaking mismatches, **4 High** production/compatibility risks (including deployed Firestore `FAILED_PRECONDITION` composite index gaps on `rentals` and `rental_charges`, non-atomic batch charge generation, role-middleware divergence, and React empty-string handling), plus **Medium** and **Low** compatibility and test gaps.

**Final Recommendation:** **Not approved; remediation required** before production cutover or client cutover. Backend index/auth/validation remediations and coordinated Flutter/React client alignment should be completed in the order listed in Section 12.

---

## 2. Review Scope and Evidence

- **Backend Firebase (`backend-firebase/`):** `src/app.ts`, `src/config/env.ts`, `src/auth/*`, `src/middleware/*`, `src/domain/types.ts`, `src/shared/*`, `src/reference/*`, `src/rental/*`, `src/payment/*`, `src/inventory/*`, `src/servicing/*`, `src/reports/*`, `src/controllers/*`, `src/routes/*`, `firestore.indexes.json`, `firestore.rules`, and all 20 test files in `tests/`.
- **Authoritative Java Reference (`backend/`):** `SecurityConfig.java`, `JwtTokenProvider.java`, `JwtAuthenticationFilter.java`, `GlobalExceptionHandler.java`, `ErrorResponse.java`, and all controllers, services, repositories, entities, and DTOs across `auth`, `bike`, `customer`, `rental`, `payment`, `inventory`, `servicing`, and `report` modules.
- **Clients:** `mobile/lib/` (Flutter API client, providers, models, and screens) and `web/src/` (`App.tsx`, `api.ts`).
- **Verification Basis:** Static code audit, `typecheck`, `build`, and offline unit/schema test execution (`39 passed, 0 failed, 6 skipped` in sandbox). Full Firestore Emulator runs were executed manually by the user in PowerShell; **no live Java-vs-Firebase differential test suite was executed** (`tests/c3.contract.test.ts` checks a static JSON fixture only).

---

## 3. Route-by-Route Review (All 61 Endpoints)

### 3.1 Authentication (`AuthController`, Routes 1–6 — `/api/v1/auth`)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 1 | `POST /api/v1/auth/login` | `200` | Public | **Unintentional gap:** `auth.service.ts:71` rejects non-`ROLE_OWNER` (`401`); Java allows any active `AppUser`. **Intentional fix:** inactive user returns `401` (Java `500`), password errors redact `rejectedValue`. |
| 2 | `POST /api/v1/auth/bootstrap-owner` | `201` / `409` | Public | **Unintentional gap:** `auth.service.ts:88-97` rejects `preferredLanguage: null` (`400`); Java defaults `null` to `"en"`. Path, `201`/`409`, `LoginResponse` match. |
| 3 | `GET /api/v1/auth/profile` | `200` | Auth + **Owner** | **Unintentional gap:** `auth.routes.ts:17` applies `ownerMiddleware` (`403` for non-owners); Java allows any authenticated user. |
| 4 | `PATCH /api/v1/auth/profile/language` | `200` | Auth + **Owner** | **Unintentional gap:** `ownerMiddleware` at `auth.routes.ts:17` blocks non-owners; path, `^(en\|ro)$`, DTO match. |
| 5 | `PATCH /api/v1/auth/profile/currency` | `200` | Auth + **Owner** | **Unintentional gap:** `ownerMiddleware` at `auth.routes.ts:17` blocks non-owners; path, `^(RON\|EUR\|USD)$`, DTO match. |
| 6 | `POST /api/v1/auth/reset-password` | `200` / `404` | Auth + **Owner** | **Intentional documented deviation:** Gated by `ENABLE_DEV_PASSWORD_RESET` (forbidden in prod, `404` when disabled), owner-only, self-email only, bumps `authVersion` + `tokenIssuedBefore`. |

### 3.2 Motorbikes (`BikeController`, Routes 7–13 — `/api/v1/bikes`)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 7 | `POST /api/v1/bikes` | `201` | Auth only | **Exact parity** on path, defaults (`0.00`, `30`, `AVAILABLE`), normalization, `409` locks. **Intentional:** `BikeDto` emits both `manufactureYear` and `yearOfManufacture` (Flutter); optional `""` normalized to `null` (React). |
| 8 | `GET /api/v1/bikes` | `200` | Auth only | **Exact parity** on filters/defaults (`includeArchived=false`, `createdAt,DESC`). **Intentional:** bounded scan `MAX_SEARCH_SCAN_DOCS = 1000` (`422`); 11 sort fields supported. |
| 9 | `GET /api/v1/bikes/{id}` | `200` | Auth only | **Exact Java parity** (`400` bad UUID, `404` missing). |
| 10 | `PUT /api/v1/bikes/{id}` | `200` | Auth only | **Intentional documented deviation:** Blocks leaving `RENTED` while active rental/lock exists (`400`), syncs active rental display fields only (historical closed rentals/services immutable). |
| 11 | `PATCH /api/v1/bikes/{id}/status` | `200` | Auth only | **Exact Java parity** + checks `active_rental_locks/{bikeId}` alongside `bike.status === 'RENTED'`. |
| 12 | `POST /api/v1/bikes/{id}/archive` | `200` | Auth only | **Exact Java parity** (`400` if rented, sets `archived: true, status: 'INACTIVE'`, retains `unique_keys` locks). |
| 13 | `POST /api/v1/bikes/{id}/unarchive` | `200` | Auth only | **Exact parity** (`archived: false, status: 'AVAILABLE'`). **Intentional:** rejects `409` if stale `active_rental_locks/{bikeId}` exists. |

### 3.3 Customers (`CustomerController`, Routes 14–20 — `/api/v1/customers`)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 14 | `POST /api/v1/customers` | `201` | Auth only | **Exact parity** on phone locks (`409`), defaults (`A,A2`, `todayUtc()`). **Intentional:** React `"" -> null` normalization; UTC vs JVM `LocalDate.now()` for `gdprConsentDate`. |
| 15 | `GET /api/v1/customers` | `200` | Auth only | **Exact parity** on `fullName`/`phone`/`email`/`cnpOrTaxId` search and defaults. **Intentional:** `MAX_SEARCH_SCAN_DOCS = 1000` (`422`). |
| 16 | `GET /api/v1/customers/{id}` | `200` | Auth only | **Exact Java parity** (`400` / `404`). |
| 17 | `PUT /api/v1/customers/{id}` | `200` | Auth only | **Exact parity** on preserving `dateOfBirth`, `livingCity`, `gdprConsentDate`, `archived`, omitted `licenceCategories` + phone lock swap. **Intentional:** historical `rentals`/`payments` snapshots immutable. |
| 18 | `POST /api/v1/customers/{id}/archive` | `200` | Auth only | **Exact Java parity** (allowed with active rentals, retains `customer_phone` lock). |
| 19 | `POST /api/v1/customers/{id}/unarchive` | `200` | Auth only | **Exact Java parity**. |
| 20 | `GET /api/v1/customers/{id}/balance-summary` | `200` | Auth only | **Exact Java parity** — delegates directly to `PaymentService.getCustomerBalanceSummary`. |

### 3.4 Rentals & Rental Charges (`RentalController` / `RentalChargeController`, Routes 21–30)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 21 | `POST /api/v1/rentals` | `201` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware` (`rental.routes.ts:13`); rejects `plannedEndDate < startDate` on create (`rental.service.ts:228-230`, Java only checks on update); rejects `depositAmount: ""`. |
| 22 | `POST /api/v1/rentals/{id}/close` | `200` | Auth + **Owner** | **Unintentional gap:** `ownerMiddleware`. **Intentional:** deletes/verifies `active_rental_locks/{bikeId}` (`409` if missing/mismatched). |
| 23 | `PUT /api/v1/rentals/{id}` | `200` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware`; requires `oldBike.status === 'RENTED'` + `active_rental_locks` (`rental.service.ts:372-376`). |
| 24 | `GET /api/v1/rentals/{id}` | `200` | Auth + **Owner** | **Unintentional gap:** `ownerMiddleware`; DTO parity matches. |
| 25 | `GET /api/v1/rentals` | `200` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware`; `customerId`/`bikeId` not UUID-validated; `sort` restricted to 3 fields; missing `createdAt`/`status` composite indexes. |
| 26 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-next` | `201` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware`; returns existing charge with `201` if doc already exists (`rental.service.ts:469-473`). |
| 27 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-up-to-date` | `201` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware`; **non-atomic** loop across separate transactions + 1,000-charge cap (`409`). |
| 28 | `GET /api/v1/rental-charges/rental/{rentalId}` | `200` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware`; 1,000-item `OperationalError` cap (`rental.service.ts:533-535`). |
| 29 | `GET /api/v1/rental-charges/due` | `200` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware`; `todayUtc()` vs JVM `LocalDate.now()`; 1,000-item cap. |
| 30 | `GET /api/v1/rental-charges` | `200` | Auth + **Owner** | **Unintentional gaps:** `ownerMiddleware`; `customerId`/`rentalId` not UUID-validated; `sort` restricted to 4 fields; missing multi-filter `dueDate DESC` & `customerId+rentalId` indexes. |

### 3.5 Payments (`PaymentController`, Routes 31–37 — `/api/v1/payments`)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 31 | `POST /api/v1/payments` | `201` | Auth only | **Intentional:** `manualAllocations[].rentalChargeId` accepts non-UUID `${rentalId}_${seq}` IDs; `422` transaction budgets. **Unintentional gaps:** `referenceNumber > 100` -> `400` (Java `500`); `parseStrictMoney` rejects >2 decimals (`400`). |
| 32 | `POST /api/v1/payments/{id}/reverse` | `200` | Auth only | **Exact Java parity** (preserves audit allocations, recalculates charge `paidAmount`/`remainingAmount`/`status`, creates `payment_reversals`). |
| 33 | `GET /api/v1/payments/{id}` | `200` | Auth only | **Exact Java parity**. |
| 34 | `GET /api/v1/payments` | `200` | Auth only | **Unintentional gap:** `sort` restricted to `['paymentDate']` (`payment.validation.ts:252`); Java allows any `Payment` property. |
| 35 | `GET /api/v1/payments/customer/{customerId}` | `200` | Auth only | **Exact Java parity**. |
| 36 | `GET /api/v1/payments/rental/{rentalId}` | `200` | Auth only | **Exact Java parity**. |
| 37 | `GET /api/v1/payments/balance-summary/{customerId}` | `200` | Auth only | **Exact Java parity** (`totalBilled`, `CONFIRMED` `totalPaid`, `max(0, outstanding)` per currency). |

### 3.6 Inventory (`PartController`, `StockMovementController`, `SupplierController`, Routes 38–52)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 38 | `POST /api/v1/parts` | `201` | Auth only | **Exact parity** on `INITIAL_SETUP` ledger & SHA-256 `part_code` lock. **Intentional:** dual `lowStock`/`isLowStock` DTO keys. |
| 39 | `PUT /api/v1/parts/{id}` | `200` | Auth only | **Unintentional gap:** `parseUpdatePartInput` defaults omitted `unitOfMeasure` to `'PCS'` and uppercases it (`inventory.validation.ts:204-206`); Java requires `@NotBlank` without uppercasing. |
| 40 | `GET /api/v1/parts/{id}` | `200` | Auth only | **Exact Java parity**. |
| 41 | `GET /api/v1/parts` | `200` | Auth only | **Unintentional gap:** whitelist uses `isActive` (`inventory.validation.ts:416`) instead of Java `active`, rejecting `sort=active,asc`. |
| 42 | `GET /api/v1/parts/low-stock` | `200` | Auth only | **Exact Java parity**. |
| 43 | `POST /api/v1/parts/{id}/archive` | `200` | Auth only | **Exact Java parity** (retains `part_code` lock). |
| 44 | `POST /api/v1/parts/{id}/unarchive` | `200` | Auth only | **Exact Java parity**. |
| 45 | `POST /api/v1/stock-movements` | `201` | Auth only | **Exact Java parity** across all 6 `StockMovementType` enums, signed deltas, negative-stock & archived-part guards. |
| 46 | `GET /api/v1/stock-movements/part/{partId}` | `200` | Auth only | **Exact Java parity**. |
| 47 | `GET /api/v1/stock-movements` | `200` | Auth only | **Exact Java parity** (all filters, `createdAt,DESC` default, 5 sort fields). |
| 48 | `POST /api/v1/suppliers` | `201` | Auth only | **Exact Java parity** (`supplier_name` SHA-256 lock). |
| 49 | `GET /api/v1/suppliers` | `200` | Auth only | **Unintentional gap:** whitelist uses `isActive` (`inventory.validation.ts:473`) instead of Java `active`. |
| 50 | `GET /api/v1/suppliers/{id}` | `200` | Auth only | **Exact Java parity**. |
| 51 | `POST /api/v1/suppliers/{id}/archive` | `200` | Auth only | **Exact Java parity**. |
| 52 | `POST /api/v1/suppliers/{id}/unarchive` | `200` | Auth only | **Exact Java parity**. |

### 3.7 Servicing (`ServicingController`, Routes 53–57 — `/api/v1/services`)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 53 | `POST /api/v1/services` | `201` | Auth only | **Intentional:** aggregates duplicate `partId`s before stock check; emits dual `bikeRegistrationNumber`/`motorbikeRegistrationNumber`; `50` items / `422` caps. **Unintentional gap:** omitted `partsUsed[].currency` defaults to `part.costCurrency` (`inventory.service.ts:520`) instead of Java `'RON'` (`LogServicePartItem.java:20`). |
| 54 | `GET /api/v1/services/{id}` | `200` | Auth only | **Exact Java parity**. |
| 55 | `GET /api/v1/services/bike/{bikeId}` | `200` | Auth only | **Exact Java parity**. |
| 56 | `GET /api/v1/services` | `200` | Auth only | **Exact Java parity** (bounded scan fallback for non-`serviceDate` sorts). |
| 57 | `GET /api/v1/services/due` | `200` | Auth only | **Unintentional minor gap:** `todayUtc()` vs Java `LocalDate.now()`. |

### 3.8 Reports (`ReportController`, Routes 58–61 — `/api/v1/reports`)
| # | Method & Path | Status | Auth | Parity Classification & Notes |
| :---: | :--- | :---: | :--- | :--- |
| 58 | `GET /api/v1/reports/dashboard` | `200` | Auth only | **Exact Java parity** (`todayUtc()` vs `LocalDate.now()` boundary). |
| 59 | `GET /api/v1/reports/fleet-utilization` | `200` | Auth only | **Exact Java parity**. |
| 60 | `GET /api/v1/reports/date-range` | `200` | Auth only | **Intentional documented deviation:** returns `400` on missing/invalid/`fromDate > toDate` (Java returns `500` on `IllegalArgumentException`). |
| 61 | `GET /api/v1/reports/bike-roi/{bikeId}` | `200` | Auth only | **Exact literal Java parity:** intentionally retains Java's `rentalId === bikeId` payment lookup across all statuses (`reports.repository.ts:174-179`). |

---

## 4. Java Compatibility Matrix

| Domain / Business Rule | Classification | Details |
| :--- | :--- | :--- |
| **Rental creation & closure (`active_rental_locks`)** | **Intentional documented deviation** | Paired bike status + `active_rental_locks/{bikeId}` prevents double-booking and stale edits; `create` adds `plannedEndDate >= startDate`, `update` verifies lock ownership. |
| **Weekly charge generation (`generateUpToDate`)** | **Unintentional compatibility gap** | Sequential transactions (non-atomic) + 1,000-charge limit vs Java single `@Transactional`. |
| **Payment allocation (`AUTO_FIFO` / `MANUAL`), reversals & balances** | **Exact Java parity** (with documented `422` safeguards) | Currency isolation, stale `PAID` reconciliation, audit allocation preservation, `BigInt` minor-unit precision, non-UUID charge IDs, strict 2-decimal parsing. |
| **Inventory stock movements & negative-stock protection** | **Exact Java parity** | All 6 types, `INITIAL_SETUP` ledger, `>0` validation, archived-part block, negative-stock block. |
| **Servicing stock deductions across all 4 statuses** | **Exact parity** + **Intentional aggregation** + **1 Gap** | All 4 statuses deduct stock (`SERVICE_USAGE`), duplicate `partId`s aggregated (`400` on overdraft), gap when `partsUsed[].currency` is omitted on `EUR`/`USD` parts. |
| **Supplier & movement history** | **Exact Java parity** (except `active` vs `isActive` sort) | Email flexibility, `createdAt DESC` history, `partCode`/`supplierName` locks. |
| **Dashboard & reports calculations** | **Exact Java parity** + **Intentional `400` date-range fix** | `monthlyExpenses: 0`, inclusive date-range, literal Bike ROI `rentalId === bikeId` parity. |
| **Archived bikes/customers & snapshot immutability** | **Intentional documented deviation** | Uniqueness locks retained on archive; historical closed rentals/payments/service records keep creation-time snapshots; only active rental bike display fields sync on `PUT /bikes/{id}`. |

---

## 5. Authentication & Security Findings

1. **JWT & Bcrypt Parity (`jwt.service.ts`, `auth.service.ts`):** Secret decoding (Base64 fallback UTF-8), HMAC algorithm selection (`HS256`/`HS384`/`HS512`), `sub`/`userId`/`role`/`lang`/`iat`/`exp` claims, and `bcrypt` cost `12` match Java. Firebase adds `authVersion`, `tokenIssuedBefore`, `isActive === true`, and `role`/`emailNormalized` checks in `JwtService.validateClaims`, fixing Java's gap where deactivated users' JWTs remained valid until expiry.
2. **Role Middleware Divergence (`auth.routes.ts:17`, `rental.routes.ts:13`, `rental-charge.routes.ts:13`):** Java `SecurityConfig.java:100` has **no** `@PreAuthorize` on any controller. Applying `ownerMiddleware` to `/api/v1/auth/profile*` and `/api/v1/rentals*` / `/api/v1/rental-charges*` (and rejecting non-`ROLE_OWNER` in `login`) breaks parity if `ROLE_CUSTOMER` accounts are used.
3. **CORS & HTTP Hardening (`app.ts:24-28`):** `cors(...)` omits `credentials: true` and `exposedHeaders: ['Authorization', 'Content-Disposition']`. `helmet` / Spring Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Cache-Control: no-store`) and `/login` / `/bootstrap-owner` rate limiting are absent.
4. **Data Exposure & Rules:** Passwords are redacted (`'[REDACTED]'`) in `validationErrors` (`auth.service.ts:48`); `UserProfile` strips sensitive fields; `firestore.rules` locks out direct client Firestore access (`allow read, write: if false;`).

---

## 6. Transaction & Data Integrity Findings

1. **Read-Before-Write Compliance:** Every `runTransaction` across `auth`, `reference`, `rental`, `payment`, `inventory`, and `servicing` completes all `tx.get` / `tx.getAll` calls strictly before any `tx.set` / `tx.create` / `tx.update` / `tx.delete`.
2. **Transaction Budget Enforcement:** `PaymentService` and `InventoryService`/`ServicingService`/`BikeService`/`CustomerService` validate write counts (`<= 500`) and payload size (`<= 10 MiB`) via `assertTransactionBudget`, throwing `422 UnprocessableEntityError` before writing.
3. **Non-Atomic `generateUpToDate` (`rental.service.ts:505-529`):** Commits one transaction per charge outside an enclosing transaction; partial writes remain if it fails mid-run or hits 1,000 charges.
4. **Read Contention / Non-Transactional Reads:** `AUTO_FIFO` reads up to 500 open charges in-transaction (`fetchAllEligibleAutoFifoCharges`); `getCustomerBalanceSummary` and `paginateIndexedQuery` execute non-transactional reads (acceptable for read endpoints, minor point-in-time skew possible).
5. **No Idempotency Keys:** Retrying `POST /payments`, `POST /stock-movements`, or `POST /services` after a client timeout creates duplicate entries (matches Java).

---

## 7. Firestore Index & Scalability Findings

### Queries Covered vs. `FAILED_PRECONDITION` Risks in Deployed Firestore
- **Covered:** `app_users`, `payments` (all 15 subsets of `{status, currency, paymentMethod, customerId}` × `paymentDate ASC/DESC`), `payment_allocations`, `payment_reversals`, `parts`, `stock_movements`, `suppliers`, `service_records`, `bikes` (6 new composites), `customers` (2 new composites), `reports`, and `rentals` when `sortField === 'startDate'`.
- **Deployed Firestore `FAILED_PRECONDITION` Risks (Emulator does NOT enforce composite indexes):**
  1. `GET /api/v1/rentals` (`rental.repository.ts:147-151`, `rental.service.ts:423`): Passing any filter (`status`, `customerId`, `bikeId`) with `sort=createdAt,ASC|DESC` or `sort=status,ASC|DESC` has **no** composite indexes in `firestore.indexes.json:3-124`.
  2. `GET /api/v1/rental-charges` (`rental.repository.ts:158-163`, `rental.service.ts:558`): Missing composite indexes in `firestore.indexes.json:126-278` for:
     - Any 2+ equality filters with `sort=dueDate,DESC` (only `ASCENDING` is declared).
     - Combining `customerId` + `rentalId` (any sort/direction).
     - Any filter with `sort=createdAt` or `sort=status`.
     - `sort=chargeSequence` with `currency`, `customerId`, `status` alone, or `status+rentalId+DESC`.

### Bounded Scans & Scale Limits
- `MAX_SEARCH_SCAN_DOCS = 1000` (`bikes`, `customers`, non-indexed `parts`/`suppliers`/`stock_movements`/`service_records`) and `MAX_REPORT_SCAN_DOCS = 1000` (`reports`) fail with `422` above 1,000 docs; `rental_charges` `dueCharges` / `chargesForRental` fail with `409` above 1,000 docs.
- Helper queries `getLowStockParts`, `getMovementsForPart`, `getServicesForBike`, `getDueServices`, `findPaymentsByCustomerId`, `findPaymentsByRentalId`, `findChargesForCustomer`, and `findConfirmedPaymentsForCustomer` have **no `.limit()`**.
- Offset pagination (`startAfter` loop) re-reads `page * size` docs on deep pages.

---

## 8. Flutter (`mobile/lib/`) Compatibility Findings

1. **[Critical] Inventory Movement Enum Mismatch (`inventory_screen.dart:37, 68, 72, 105, 139`):** Flutter sends `'PURCHASE'` and `'USAGE_NON_SERVICE'`; backend only accepts `'STOCK_IN'` / `'STOCK_OUT'` / `'SERVICE_USAGE'` / `'RETURN'` / `'ADJUSTMENT'` / `'REVERSAL'` -> `400 VALIDATION_FAILED`.
2. **[Critical] Bike Creation Key (`add_bike_screen.dart:77`):** Flutter sends `yearOfManufacture`; `POST /api/v1/bikes` requires `manufactureYear` -> `400 VALIDATION_FAILED` (reads work because `BikeDto` emits both).
3. **[Critical] Payment Reversal Key (`payment_provider.dart:107`):** Flutter sends `{'reversalReason': reason}`; `POST /api/v1/payments/:id/reverse` requires `{'reason': ...}` -> `400 VALIDATION_FAILED`.
4. **[Critical] Unsupported `'CARD'` Method (`record_payment_screen.dart:191`):** Backend only accepts `'CASH' | 'BANK_TRANSFER'` -> `400 VALIDATION_FAILED`.
5. **[Medium] `RentalModel.fromJson` (`rental_model.dart:46`):** Reads `json['motorbikeId']`, but `RentalDto` returns `bikeId` (always `''`).
6. **[Medium] `PaymentAllocation.fromJson` (`payment_model.dart:20, 22`):** Reads `sequenceNumber` and `createdAt`, but `PaymentAllocationDto` returns `chargeSequence` and `allocatedAt` (always `0` / `''`).
7. **[Medium] Error Surfacing & Auth (`api_client.dart:49-51`):** Discards `data['validationErrors']` details and lacks a mid-session `401` interceptor.

---

## 9. React (`web/src/`) Compatibility Findings

1. **[Critical] Unsupported `'CARD'` Method (`App.tsx:128, 266`):** Backend rejects `'CARD'` with `400`.
2. **[High] Empty Optional Numeric/Select Inputs Sent as `""` (`App.tsx:84, 111-112, 120-121, 391`):** Cleared `depositAmount`/`unitCost` or unselected `depositCurrency` send `""`, failing `normalizeMoney`/`parseStrictMoney`/`validateCurrency` (`400`) on `POST /rentals` and `POST /stock-movements`. (`Customers` optional `""` inputs are already handled cleanly by `reference.validation.ts`.)
3. **[Medium] Broken Table Display Columns:**
   - `Customers` table (`App.tsx:86`) reads `status` (`CustomerDto` has `archived: boolean`) -> renders `—`.
   - `Rentals` table (`App.tsx:220`) reads `motorbikeRegistrationNumber` (`RentalDto` returns `bikeRegistrationNumber`) -> renders `—`.
4. **[Medium] Auth Persistence (`App.tsx:25, 36`):** Lacks a `401` response interceptor for expired/revoked tokens and does not sync user language/currency from login response.

---

## 10. Test Coverage Gaps

- **Missing Route Integration Tests:** `PATCH /api/v1/auth/profile/language`, `PATCH /api/v1/auth/profile/currency`, and `POST /api/v1/auth/reset-password` have **0** integration tests in `tests/auth.test.ts`.
- **Rental/Charge Edge Cases (`tests/rental.test.ts`):** Missing tests for `close` with `closureDate < startDate`, closing an already-closed rental, `PUT /rentals/:id` on closed rentals, `generate-up-to-date` generating `> 0` charges, concurrent `generate-next` vs `generate-up-to-date`, and `1,000`-item `OperationalError` limit.
- **Payment Concurrency & Chunking:** Missing tests for concurrent `POST /payments` vs `POST /payments/:id/reverse` and `paidAmountsForCharges` chunking (>30 charges / >100 payments).
- **Index Verification Blind Spot:** `tests/indexes.test.ts` only tests a subset of `rentals`/`rental_charges` filter+sort combinations, and the Firestore Emulator does not enforce composite indexes.
- **No Live Differential Testing:** No automated comparison between live Java `backend/` and `backend-firebase/` responses.

---

## 11. Findings Classified by Severity

| Severity | Finding | Location |
| :--- | :--- | :--- |
| **Critical** | Flutter sends `PURCHASE` / `USAGE_NON_SERVICE` instead of `STOCK_IN` / `STOCK_OUT` | `mobile/.../inventory_screen.dart`, `inventory.validation.ts:28-35` |
| **Critical** | Flutter sends `yearOfManufacture` instead of `manufactureYear` on bike creation | `mobile/.../add_bike_screen.dart:77`, `reference.validation.ts:204` |
| **Critical** | Flutter sends `reversalReason` instead of `reason` on payment reversal | `mobile/.../payment_provider.dart:107`, `payment.validation.ts:223` |
| **Critical** | Flutter & React offer `'CARD'` payment method (rejected by backend) | `record_payment_screen.dart:191`, `App.tsx:128,266`, `payment.validation.ts:20` |
| **High** | Missing `rentals` & `rental_charges` composite indexes (`FAILED_PRECONDITION` in prod) | `firestore.indexes.json:3-278`, `rental.repository.ts:147-163` |
| **High** | Non-atomic `generateUpToDate` loop can leave partial charges | `rental.service.ts:505-529` |
| **High** | `ownerMiddleware` / `ROLE_OWNER` check blocks non-owners on `/auth/profile*`, `/login`, `/rentals*` | `auth.routes.ts:17`, `auth.service.ts:71`, `rental*.routes.ts:13` |
| **High** | React sends `""` for cleared numeric/select optional fields (`depositAmount`, `unitCost`, `depositCurrency`) | `App.tsx:84,111-121,391`, `rental.service.ts:129-146`, `inventory.validation.ts:242` |
| **Medium** | `POST /services` omitted `partsUsed[].currency` uses `part.costCurrency` instead of Java `'RON'` | `inventory.service.ts:520` vs `LogServicePartItem.java:20` |
| **Medium** | `GET /parts` & `GET /suppliers` whitelist `isActive` instead of Java `active` | `inventory.validation.ts:416,473` |
| **Medium** | `PUT /parts/:id` defaults/uppercases `unitOfMeasure` differently from Java | `inventory.validation.ts:204-206` |
| **Medium** | `bootstrap-owner` rejects `preferredLanguage: null`; `rental.create` checks `plannedEndDate` | `auth.service.ts:88-97`, `rental.service.ts:228-230` |
| **Medium** | Flutter `RentalModel` (`motorbikeId`) & `PaymentAllocation` (`sequenceNumber`/`createdAt`) field mismatches | `rental_model.dart:46`, `payment_model.dart:20,22` |
| **Medium** | React `Customers` (`status`) & `Rentals` (`motorbikeRegistrationNumber`) table columns blank | `App.tsx:86,220` |
| **Medium** | CORS lacks `credentials`/`exposedHeaders`; no `helmet` headers; missing route/concurrency tests | `app.ts:25-27`, `tests/auth.test.ts`, `tests/rental.test.ts` |
| **Low** | Unbounded helper queries without `.limit()`; deep-page offset re-reads; no idempotency keys | `inventory/payment/servicing.repository.ts` |
| **Low** | UTC vs JVM `LocalDate.now()` in due/dashboard/GDPR defaults; `generateNext` 201 on existing ID | `dates.ts`, `rental.service.ts:469-473` |
| **Info** | Intentional `PUT /bikes/{id}` rented guard, `date-range` `400`, Bike ROI literal parity, snapshot policy, `422` caps | `bike.service.ts`, `reports.service.ts`, `reference.repository.ts` |

---

## 12. Recommended Remediation Order

1. **Fix `firestore.indexes.json` (High):** Add missing `rentals` (`createdAt`/`status` with filters) and `rental_charges` (`dueDate DESC`, `customerId+rentalId`, `createdAt`, `status`, `chargeSequence`) composite indexes, or restrict `sort` allow-lists to indexed fields.
2. **Fix Backend Java Parity & Validation Edge Cases (Medium/High):**
   - Decide & align `ownerMiddleware` on `/auth/profile*` and `/rentals*` / `/rental-charges*` (or document as intentional and keep `auth/profile*` auth-only).
   - Accept `"" -> null` for optional `depositAmount`, `depositCurrency`, `unitCost` (or fix React `App.tsx` normalization).
   - Support `sort=active` alongside `isActive` on `parts`/`suppliers`, align `LogServicePartItem.currency` default if strict Java parity is required, and align `cors` `exposedHeaders`/`credentials` + `helmet`.
3. **Fix Flutter & React Breaking Mismatches (Critical, coordinated with client release):**
   - Update Flutter `inventory_screen.dart` (`STOCK_IN`/`STOCK_OUT`), `add_bike_screen.dart` (`manufactureYear`), `payment_provider.dart` (`reason`), `RentalModel` (`bikeId`), `PaymentAllocation` (`chargeSequence`/`allocatedAt`), and remove `'CARD'` (or add backend `'CARD'` enum support if business-required).
   - Update React `App.tsx` (`normalize` `"" -> null`, remove/support `'CARD'`, fix `archived` / `bikeRegistrationNumber` table columns).
4. **Harden Transactions & Tests (High/Medium):** Make `generateUpToDate` bounded/atomic (or document partial-commit behavior), add missing integration tests (`/auth/profile/*`, `/reset-password`, rental edge cases, payment/reversal concurrency), and run `npm audit --omit=dev` in a networked environment.

---

## 13. Production Blockers

1. Missing `rentals` and `rental_charges` composite indexes in `firestore.indexes.json` causing `FAILED_PRECONDITION` in deployed Firestore.
2. Critical Flutter request/response contract mismatches (`PURCHASE`/`USAGE_NON_SERVICE`, `yearOfManufacture`, `reversalReason`, `'CARD'`) and React `'CARD'` / `""` numeric form failures.
3. Unverified `npm audit --omit=dev` (blocked offline in sandbox) and undeployed `firestore.indexes.json` / `firestore.rules`.
4. Absence of live Java-vs-Firebase differential integration test verification on staging data.

---

## 14. Final Stage Recommendation

**Not approved; remediation required.**  
Resolve the Critical client mismatches, High Firestore composite-index gaps, and High auth/empty-string parity issues listed in Section 12 before proceeding to production cutover or client release.

# Stage C8.0 – Motorbikes & Customers Implementation Specification

**Status:** Stage C8.0 Contract Audit & Specification (Documentation Only — Wait for Approval Before C8.1 Implementation)  
**Target Codebase:** `backend-firebase/`  
**Authoritative Reference:** `backend/` (`BikeController`, `BikeService`, `CustomerController`, `CustomerService`, `SecurityConfig`, DTOs, Entities, Repositories)  
**Scope Exclusion:** Documentation only (`docs/firebase-migration/stage-c8-bikes-customers-implementation-specification.md`); no changes to `backend/`, `backend-firebase/`, `mobile/`, `web/`, Neon PostgreSQL, or production Firebase.

---

## 1. Executive Summary & Scope (Routes 7–20)

Stage C8 implements the remaining **14 REST API routes (Routes 7–20)** from [api-compatibility-matrix.md](api-compatibility-matrix.md), completing **61/61** Java Spring Boot endpoints in `backend-firebase`:

- **Motorbikes Module (`BikeController`, Routes 7–13, mounted at `/api/v1/bikes`):**
  - **Route 7:** `POST /api/v1/bikes` (`createBike`) -> `201 Created` (`BikeDto`)
  - **Route 8:** `GET /api/v1/bikes` (`listBikes`) -> `200 OK` (`PageResponse<BikeDto>`)
  - **Route 9:** `GET /api/v1/bikes/{id}` (`getBike`) -> `200 OK` (`BikeDto`)
  - **Route 10:** `PUT /api/v1/bikes/{id}` (`updateBike`) -> `200 OK` (`BikeDto`)
  - **Route 11:** `PATCH /api/v1/bikes/{id}/status` (`updateBikeStatus`) -> `200 OK` (`BikeDto`)
  - **Route 12:** `POST /api/v1/bikes/{id}/archive` (`archiveBike`) -> `200 OK` (`BikeDto`)
  - **Route 13:** `POST /api/v1/bikes/{id}/unarchive` (`unarchiveBike`) -> `200 OK` (`BikeDto`)
- **Customers Module (`CustomerController`, Routes 14–20, mounted at `/api/v1/customers`):**
  - **Route 14:** `POST /api/v1/customers` (`createCustomer`) -> `201 Created` (`CustomerDto`)
  - **Route 15:** `GET /api/v1/customers` (`listCustomers`) -> `200 OK` (`PageResponse<CustomerDto>`)
  - **Route 16:** `GET /api/v1/customers/{id}` (`getCustomer`) -> `200 OK` (`CustomerDto`)
  - **Route 17:** `PUT /api/v1/customers/{id}` (`updateCustomer`) -> `200 OK` (`CustomerDto`)
  - **Route 18:** `POST /api/v1/customers/{id}/archive` (`archiveCustomer`) -> `200 OK` (`CustomerDto`)
  - **Route 19:** `POST /api/v1/customers/{id}/unarchive` (`unarchiveCustomer`) -> `200 OK` (`CustomerDto`)
  - **Route 20:** `GET /api/v1/customers/{id}/balance-summary` (`getCustomerBalanceSummary`) -> `200 OK` (`CustomerBalanceSummaryDto`, delegated directly to Stage C4 `PaymentService.getCustomerBalanceSummary`)

### Summary of Key Architectural Decisions

1. **`PUT /api/v1/bikes/{id}` Active-Rental Guard:** Blocks overwriting `status` away from `RENTED` while `bike.status === 'RENTED' || activeLockSnap.exists`, enforcing Stage C3 rental lock integrity (documented intentional deviation from Java `BikeService.updateBike`). Non-status updates on rented bikes remain allowed when `status` is omitted/`null` or `'RENTED'`.
2. **Denormalized Snapshot Update Policy:** `PUT /api/v1/bikes/{id}` and `PUT /api/v1/customers/{id}` update authoritative `bikes/{id}` and `customers/{id}` documents in $O(1)$ bounded transactions (syncing at most the single active rental's `bikeRegistrationNumber`/`bikeMakeModel` via `active_rental_locks/{bikeId}` when a rented bike's identity changes). Historical `CLOSED`/`CANCELLED` rentals, `payments`, and `service_records` retain immutable point-in-time snapshots.
3. **Authentication Only (`createAuthMiddleware`):** Matches Java `SecurityConfig` (`.anyRequest().authenticated()` with no `@PreAuthorize`) and Stages C4–C7 (**no `ownerMiddleware`**).
4. **Hashed Uniqueness Locks (`unique_keys`):** Enforces global uniqueness for `bike_registration_number`, `bike_vin`, and `customer_phone` via deterministic SHA-256 locks, with atomic reserve-new / release-old semantics on update and lock retention on archive.

---

## 2. Authoritative Java Source Audit (with Line References)

### 2.1 Motorbikes (`backend/src/main/java/ro/bikerental/modules/bike/`)
- **`BikeController.java` (lines 1–83):** `@RestController`, `@RequestMapping("/api/v1/bikes")`. Defines Routes 7–13 (lines 33–82). List defaults (line 46): `@RequestParam(defaultValue = "false") boolean includeArchived`, `@PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)`.
- **`BikeService.java` (lines 1–149):**
  - `createBike` (lines 30–58): Uppercases & trims `registrationNumber` and `vin`; checks `existsByRegistrationNumber` and `existsByVin` -> `ConflictException` (`409`); trims `make` and `model`; sets `serviceIntervalDays` and `status` (defaults `BikeStatus.AVAILABLE`).
  - `updateBike` (lines 61–94): Checks existence (`404 ResourceNotFoundException("Motorbike", id)`); checks `existsByRegistrationNumberAndIdNot` and `existsByVinAndIdNot` -> `ConflictException` (`409`); overwrites fields including `notes` (nullable), updates `serviceIntervalDays` only if non-null (lines 84–86), and updates `status` only if non-null (lines 87–89) **without checking `BikeStatus.RENTED`**.
  - `getBikeById` (lines 97–101): Returns `BikeDto` (`404` if missing).
  - `updateBikeStatus` (lines 104–115): If `bike.getStatus() == BikeStatus.RENTED && newStatus != BikeStatus.RENTED`, throws `BusinessException` (`400`, `"Cannot directly change status of a currently rented bike. Please close the active rental agreement first."`).
  - `archiveBike` (lines 118–130): If `bike.getStatus() == BikeStatus.RENTED`, throws `BusinessException` (`400`, `"Cannot archive a motorbike with an active rental"`); sets `archived = true`, `status = BikeStatus.INACTIVE`.
  - `unarchiveBike` (lines 133–141): Sets `archived = false`, `status = BikeStatus.AVAILABLE`.
  - `listBikes` (lines 144–148): Delegates to `bikeRepository.searchBikes(search, status, includeArchived, pageable)`.
- **`BikeRepository.java` (lines 1–46):** `searchBikes` (lines 32–45) filters `(:includeArchived = true OR b.archived = false)`, `(:status IS NULL OR b.status = :status)`, and case-insensitive `LIKE %:search%` across `registrationNumber`, `vin`, `make`, `model`.
- **`Bike.java` (lines 1–143):** `currentOdometer` is `NUMERIC(10, 1)` default `0`; `serviceIntervalDays` default `30`; `status` default `AVAILABLE`; `archived` (`is_archived`) default `false`.
- **`BikeDto.java` (lines 1–104), `CreateBikeRequest.java` (lines 1–103), `UpdateBikeRequest.java` (lines 1–86), `UpdateBikeStatusRequest.java` (lines 1–19):** Exact field contracts documented in Section 4.

### 2.2 Customers (`backend/src/main/java/ro/bikerental/modules/customer/`)
- **`CustomerController.java` (lines 1–82):** `@RestController`, `@RequestMapping("/api/v1/customers")`. Defines Routes 14–19 delegating to `CustomerService`, and Route 20 (`GET /{id}/balance-summary`, lines 77–81) delegating directly to `paymentService.getCustomerBalanceSummary(id)`. List defaults (lines 45–47): `includeArchived = false`, `@PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)`.
- **`CustomerService.java` (lines 1–110):**
  - `createCustomer` (lines 28–51): Trims `phone`, checks `existsByPhone` -> `ConflictException` (`409`); trims `fullName`, lowercases/trims `email`, trims `cnpOrTaxId`, `drivingLicenceNumber`, `licenceCategories` (default `"A,A2"`), `address`, `livingCity`; `gdprConsentDate` defaults to `LocalDate.now()` in `CreateCustomerRequest` and `Customer` constructor.
  - `updateCustomer` (lines 54–77): Checks existence (`404 ResourceNotFoundException("Customer", id)`); checks `existsByPhoneAndIdNot` -> `ConflictException` (`409`); updates `fullName`, `phone`, `email` (trimmed/lowercased or `null`), `cnpOrTaxId`, `drivingLicenceNumber`, `licenceCategories` (only when non-null!), `licenceExpiryDate`, `address`, `notes`. Leaves `dateOfBirth`, `livingCity`, `gdprConsentDate`, and `archived` untouched.
  - `getCustomerById` (lines 80–84): Returns `CustomerDto` (`404` if missing).
  - `archiveCustomer` / `unarchiveCustomer` (lines 87–102): Sets `archived = true` / `archived = false` (`404` if missing). Does **not** check active rentals (matches Java).
  - `listCustomers` (lines 105–109): Delegates to `customerRepository.searchCustomers(search, includeArchived, pageable)`.
- **`CustomerRepository.java` (lines 1–35):** `searchCustomers` (lines 23–34) filters `(:includeArchived = true OR c.archived = false)` and matches `:search` via `LOWER(c.fullName)`, `c.phone` (`LIKE`), `LOWER(c.email)`, or `c.cnpOrTaxId` (`LIKE`).
- **`Customer.java` (lines 1–130), `CustomerDto.java` (lines 1–97), `CreateCustomerRequest.java` (lines 1–94), `UpdateCustomerRequest.java` (lines 1–64):** Exact field contracts documented in Section 4.

### 2.3 Security & Exceptions
- **`SecurityConfig.java` (lines 66–100):** `.anyRequest().authenticated()`; no `@PreAuthorize` on `BikeController` or `CustomerController`.
- **`ConflictException.java` (lines 1–9):** Maps duplicate key errors to `409 CONFLICT`.
- **`BusinessException.java` (lines 1–21) & `ResourceNotFoundException.java` (lines 1–13):** Map domain guard violations to `400 BAD_REQUEST` and missing IDs to `404 NOT_FOUND`.

---

## 3. Deep-Dive Architectural Investigations

### 3.1 Investigation 1: `PUT /api/v1/bikes/{id}` Status Changes vs. Active Rentals & `active_rental_locks`

- **Java Behavior vs. Risk:**
  - `BikeService.updateBikeStatus` (lines 108–110) and `BikeService.archiveBike` (lines 122–124) explicitly block leaving `BikeStatus.RENTED` (`400 BusinessException`), enforcing that active rentals must be closed via `POST /api/v1/rentals/{id}/close`.
  - However, `BikeService.updateBike` (`PUT /api/v1/bikes/{id}`, lines 87–89) executes `if (request.getStatus() != null) { bike.setStatus(request.getStatus()); }` without checking if `bike.getStatus() == BikeStatus.RENTED`.
- **Firebase Rental Lock Invariant ([rental.service.ts](../../backend-firebase/src/rental/rental.service.ts)):**
  - Stage C3 enforces a paired invariant for every active rental: `bikes/{bikeId}.status === 'RENTED'` **AND** `active_rental_locks/{bikeId}` exists pointing to the active `rentalId` (lines 270–279).
  - `RentalService.update` (lines 372–376) rejects edits with `409 ConflictError("Active rental lock is missing or belongs to another rental")` if `oldBike.status !== 'RENTED'` while an active rental exists.
  - `RentalService.close` (lines 339–346) only restores `bike.status = 'AVAILABLE'` if `bike.status === 'RENTED'` and deletes `active_rental_locks/{bikeId}` when `lock.rentalId === rental.id`.
  - Dashboard (`activeRentalsCount`) and Fleet Utilization (`utilizationRate`) derive rented fleet count from non-archived `bikes` with `status === 'RENTED'`.
- **Recommended Solution (Intentional Compatibility Deviation on Route 10):**
  1. Inside the Firestore transactions for `PUT /api/v1/bikes/{id}`, `PATCH /api/v1/bikes/{id}/status`, `POST /api/v1/bikes/{id}/archive`, and `POST /api/v1/bikes/{id}/unarchive`, **always read `active_rental_locks/{bikeId}` alongside `bikes/{bikeId}` in Phase 1**.
  2. **On `PUT /api/v1/bikes/{id}` (`updateBike`):**
     - If `(bike.status === 'RENTED' || activeLockSnap.exists)` **and** `input.status !== null && input.status !== 'RENTED'`: throw `400 BusinessError("Cannot directly change status of a currently rented bike. Please close the active rental agreement first.")`.
     - If `(bike.status === 'RENTED' || activeLockSnap.exists)` **and** (`input.status === null` or `input.status === 'RENTED'`): keep `status: 'RENTED'` and allow updating the non-status bike fields cleanly!
     - This preserves legitimate bike detail edits (e.g., renewing `itpExpiryDate`/`rcaExpiryDate`/`cascoExpiryDate` or correcting `notes`/`currentOdometer` while rented) without corrupting `active_rental_locks/{bikeId}` or breaking Stage C3 rental close/update transactions.
  3. **On `PATCH /api/v1/bikes/{id}/status`:** Preserve exact Java guard (`(bike.status === 'RENTED' || activeLockSnap.exists) && newStatus !== 'RENTED'` -> `400 BusinessError`).
  4. **On `POST /api/v1/bikes/{id}/archive`:** Reject with `400 BusinessError("Cannot archive a motorbike with an active rental")` if `bike.status === 'RENTED' || activeLockSnap.exists`.
  5. **On `POST /api/v1/bikes/{id}/unarchive`:** Reject with `409 ConflictError("Cannot unarchive a motorbike with an active rental lock")` if `activeLockSnap.exists`; otherwise set `isArchived: false, status: 'AVAILABLE'`.
  6. **Manual `status: 'RENTED'` on non-rented bike (`POST /bikes`, `PUT /bikes/{id}`, `PATCH /status`):** Keep Java parity by allowing `'RENTED'` when no active rental exists without fabricating a fake `active_rental_locks` document (note: Stage C3 `RentalService.create` checks `bike.status === 'AVAILABLE'`, so a manually marked `'RENTED'` bike still cannot be double-booked). Document this clearly in code comments and tests.

### 3.2 Investigation 2: Updating Bike/Customer Details vs. Denormalized Display Snapshots

- **Inventory of Denormalized Snapshot Fields in Firestore ([types.ts](../../backend-firebase/src/domain/types.ts)):**
  - `rentals/{rentalId}`: `customerName`, `customerPhone`, `bikeRegistrationNumber`, `bikeMakeModel`
  - `payments/{paymentId}`: `customerName`
  - `service_records/{serviceId}`: `bikeRegistrationNumber`, `bikeMakeModel`
  - `stock_movements`: immutable free-text `reason` (e.g., `"Used in service on motorbike <reg>"`)
- **Problem:** In Java SQL/JPA, `RentalDto`, `PaymentDto`, and `ServiceRecordDto` navigate live `@ManyToOne` foreign keys, so edits immediately appear on historical DTO reads. In Firestore, a popular customer or bike could have >500 historical rentals/payments/services, making multi-collection fan-out inside an OLTP `PUT` transaction both unscalable (exceeding Firestore's 500-write transaction limit) and inappropriate for immutable financial/service audit records.
- **Defined Behavior (Matches [firestore-data-model.md](firestore-data-model.md#L55-L61)):**
  1. **`PUT /api/v1/bikes/{id}`:**
     - Atomically updates `bikes/{id}` and swaps `unique_keys` registration/VIN locks.
     - Because `active_rental_locks/{bikeId}` is already read in Phase 1: if `activeLockSnap.exists` and `activeLockData.rentalId` is present **and** any of `registrationNumber`, `make`, or `model` changed, also read `rentals/{rentalId}` (after reading `active_rental_locks/{bikeId}`, still in the read phase before any write!) and update `bikeRegistrationNumber` + `bikeMakeModel` on that single `ACTIVE` rental document in Phase 3. Historical `CLOSED`/`CANCELLED` `rentals` and all `service_records` retain their creation-time snapshots.
     - All subsequent `POST /api/v1/rentals`, `POST /api/v1/services`, and `GET /api/v1/reports/bike-roi/{bikeId}` calls read the updated `bikes/{id}` document directly.
  2. **`PUT /api/v1/customers/{id}`:**
     - Atomically updates `customers/{id}` and swaps the `customer_phone` `unique_keys` lock if `phone` changed ($O(1)$ bounded: max 3 reads, max 3 writes). Does **not** fan out across historical `rentals` or `payments`; historical documents retain their point-in-time `customerName`/`customerPhone` snapshots.
     - Subsequent `POST /api/v1/rentals`, `POST /api/v1/payments`, and live reads (`GET /api/v1/customers/{id}/balance-summary` and `GET /api/v1/payments/balance-summary/{customerId}`) immediately reflect the updated `customers/{id}` record.
- **Documented Difference vs. Java:** Explicitly document that historical closed rentals, historical payments, and past service records in Firestore preserve creation-time display snapshots rather than dynamically joining updated bike/customer names/plates (per `firestore-data-model.md` §"Relationships and denormalization").

### 3.3 Investigation 3: Authentication & Authorization Middleware

- **Java Authoritative Rules:** `BikeController.java` and `CustomerController.java` have **no** `@PreAuthorize`, `@Secured`, or `@RolesAllowed` annotations. Access control is governed exclusively by `SecurityConfig.java` line 100 (`.anyRequest().authenticated()`).
- **Stage C8 Rule:** Both `/api/v1/bikes` (Routes 7–13) and `/api/v1/customers` (Routes 14–20) **must use `createAuthMiddleware(firestore, config)` only — without `ownerMiddleware`**, matching Stages C4–C7.
  - Missing, malformed, invalid-signature, expired, revoked (`authVersion` / `tokenIssuedBefore`), missing-user, or `isActive === false` tokens -> `401 UNAUTHORIZED`.
  - Valid `ROLE_OWNER` and `ROLE_CUSTOMER` accounts -> permitted (`200` / `201` / domain status).

---

## 4. Complete Request and Response Contracts (Routes 7–20)

### 4.1 Master Endpoint Summary

| Route # | Method & Path | Controller / Service | Request Inputs | Success Response & Status | Errors | Auth |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **7** | `POST /api/v1/bikes` | `createBike` | `CreateBikeRequest` JSON | `BikeDto` (`201 Created`) | `400`, `401`, `409` | `createAuthMiddleware` |
| **8** | `GET /api/v1/bikes` | `listBikes` | `search?`, `status?`, `includeArchived=false`, `page=0`, `size=20`, `sort=createdAt,DESC` | `PageResponse<BikeDto>` (`200 OK`) | `400`, `401`, `422` | `createAuthMiddleware` |
| **9** | `GET /api/v1/bikes/{id}` | `getBikeById` | Path UUID `id` | `BikeDto` (`200 OK`) | `400`, `401`, `404` | `createAuthMiddleware` |
| **10** | `PUT /api/v1/bikes/{id}` | `updateBike` | Path UUID `id`, `UpdateBikeRequest` JSON | `BikeDto` (`200 OK`) | `400`, `401`, `404`, `409` | `createAuthMiddleware` |
| **11** | `PATCH /api/v1/bikes/{id}/status` | `updateBikeStatus` | Path UUID `id`, `{ status }` | `BikeDto` (`200 OK`) | `400`, `401`, `404` | `createAuthMiddleware` |
| **12** | `POST /api/v1/bikes/{id}/archive` | `archiveBike` | Path UUID `id` (no body) | `BikeDto` (`200 OK`) | `400`, `401`, `404` | `createAuthMiddleware` |
| **13** | `POST /api/v1/bikes/{id}/unarchive` | `unarchiveBike` | Path UUID `id` (no body) | `BikeDto` (`200 OK`) | `401`, `404`, `409` | `createAuthMiddleware` |
| **14** | `POST /api/v1/customers` | `createCustomer` | `CreateCustomerRequest` JSON | `CustomerDto` (`201 Created`) | `400`, `401`, `409` | `createAuthMiddleware` |
| **15** | `GET /api/v1/customers` | `listCustomers` | `search?`, `includeArchived=false`, `page=0`, `size=20`, `sort=createdAt,DESC` | `PageResponse<CustomerDto>` (`200 OK`) | `400`, `401`, `422` | `createAuthMiddleware` |
| **16** | `GET /api/v1/customers/{id}` | `getCustomerById` | Path UUID `id` | `CustomerDto` (`200 OK`) | `400`, `401`, `404` | `createAuthMiddleware` |
| **17** | `PUT /api/v1/customers/{id}` | `updateCustomer` | Path UUID `id`, `UpdateCustomerRequest` JSON | `CustomerDto` (`200 OK`) | `400`, `401`, `404`, `409` | `createAuthMiddleware` |
| **18** | `POST /api/v1/customers/{id}/archive` | `archiveCustomer` | Path UUID `id` (no body) | `CustomerDto` (`200 OK`) | `400`, `401`, `404` | `createAuthMiddleware` |
| **19** | `POST /api/v1/customers/{id}/unarchive` | `unarchiveCustomer` | Path UUID `id` (no body) | `CustomerDto` (`200 OK`) | `400`, `401`, `404` | `createAuthMiddleware` |
| **20** | `GET /api/v1/customers/{id}/balance-summary` | `PaymentService.getCustomerBalanceSummary` | Path UUID `id` | `CustomerBalanceSummaryDto` (`200 OK`) | `400`, `401`, `404` | `createAuthMiddleware` |

### 4.2 Bike Request & Response DTO Contracts

#### `CreateBikeRequest` (`POST /api/v1/bikes`) & `UpdateBikeRequest` (`PUT /api/v1/bikes/{id}`)

| Field | Java Constraints | Create Default (if omitted) | Update Behavior (`PUT`) | Normalized Storage & Validation |
| :--- | :--- | :--- | :--- | :--- |
| `registrationNumber` | `@NotBlank`, `@Size(min=3, max=20)` | Required | Required | Trim & uppercase; check `value.trim().length` in `3..20` (`BikeService` stores `upper().trim()`). Unique via `bike_reg` lock (`409`). |
| `vin` | `@NotBlank`, `@Size(min=5, max=30)` | Required | Required | Trim & uppercase; check `value.trim().length` in `5..30`. Unique via `bike_vin` lock (`409`). |
| `make` | `@NotBlank`, `@Size(max=50)` | Required | Required | Non-blank string, max length `50`, trimmed. |
| `model` | `@NotBlank`, `@Size(max=50)` | Required | Required | Non-blank string, max length `50`, trimmed. |
| `manufactureYear` | `@NotNull`, `@Min(1990)`, `@Max(2050)` | Required | Required | Integer `1990 <= n <= 2050` (`ValidationError` otherwise). |
| `currentOdometer` | `@NotNull`, `@DecimalMin("0.0")` | `BigDecimal.ZERO` (`"0.00"` if omitted; reject explicit `null`) | Required (reject omitted/`null`) | Scale-2 bounded decimal `>= 0` (<= `NUMERIC(10,1)` / `MAX_ODOMETER_MINOR` `99_999_999_990n`, max 2 decimals). Stored as canonical string. |
| `itpExpiryDate` | Optional `LocalDate` | `null` | `null` if omitted/`null` | Validated `YYYY-MM-DD` via `parseDate` or `null`. |
| `rcaExpiryDate` | Optional `LocalDate` | `null` | `null` if omitted/`null` | Validated `YYYY-MM-DD` via `parseDate` or `null`. |
| `cascoExpiryDate` | Optional `LocalDate` | `null` | `null` if omitted/`null` | Validated `YYYY-MM-DD` via `parseDate` or `null`. |
| `serviceIntervalDays` | `@Min(1)` (`@NotNull` on create) | `30` (reject explicit `null`) | Optional: if omitted/`null`, preserve existing value | Integer `>= 1`. |
| `status` | `BikeStatus` | `AVAILABLE` (if omitted/`null`) | Optional: if omitted/`null`, preserve existing; guarded if `RENTED` | One of `'AVAILABLE' | 'RENTED' | 'IN_SERVICE' | 'INACTIVE'`. |
| `notes` | Optional `String` | `null` | `null` if omitted/`null` | `string` or `null`. |

#### `UpdateBikeStatusRequest` (`PATCH /api/v1/bikes/{id}/status`)
- Body must contain `status` (`@NotNull`): strictly one of `'AVAILABLE' | 'RENTED' | 'IN_SERVICE' | 'INACTIVE'` (`400 VALIDATION_FAILED` if missing/null/invalid).

#### `BikeDto` Response Shape
Exact Java fields ([BikeDto.java](../../backend/src/main/java/ro/bikerental/modules/bike/dto/BikeDto.java#L11-L29)):
```json
{
  "id": "uuid",
  "registrationNumber": "B-101-MOT",
  "vin": "JH2PC460000123456",
  "make": "Honda",
  "model": "CB500X",
  "manufactureYear": 2023,
  "yearOfManufacture": 2023,
  "currentOdometer": 12500.5,
  "itpExpiryDate": "2027-05-01",
  "rcaExpiryDate": "2027-04-01",
  "cascoExpiryDate": null,
  "serviceIntervalDays": 30,
  "nextServiceDueDate": "2026-12-10",
  "status": "AVAILABLE",
  "notes": null,
  "archived": false,
  "createdAt": "2026-11-16T00:00:00.000Z",
  "updatedAt": "2026-11-16T00:00:00.000Z"
}
```
> **Client Compatibility Note (`yearOfManufacture` & `archived`):** `BikeDto.java` emits `manufactureYear` and `archived` (used by React `App.tsx`), while Flutter `BikeModel.fromJson` (`mobile/lib/features/bikes/models/bike_model.dart` lines 43, 60) reads `yearOfManufacture` and `archived`. Emitting both `manufactureYear` and `yearOfManufacture` with the identical integer value (matching the dual-alias pattern already used in `PartDto` and `ServiceRecordDto`) keeps Java/React parity while preventing Flutter from silently defaulting to `2024`.

### 4.3 Customer Request & Response DTO Contracts

#### `CreateCustomerRequest` (`POST /api/v1/customers`) & `UpdateCustomerRequest` (`PUT /api/v1/customers/{id}`)

| Field | Java Constraints | Create Default (if omitted/`null`) | Update Behavior (`PUT`) | Normalized Storage & Validation |
| :--- | :--- | :--- | :--- | :--- |
| `fullName` | `@NotBlank`, `@Size(max=150)` | Required | Required | Non-blank string, max `150` chars, stored trimmed. |
| `phone` | `@NotBlank`, `@Size(min=8, max=30)` | Required | Required | Non-blank trimmed string length `8..30`. Unique via `customer_phone` lock (`409`). |
| `email` | `@Email` (`length=150` in DB) | `null` | Overwritten (nullable) | Optional string; if non-null & non-empty, validate email format + length `<= 150` and store `trim().toLowerCase()`; empty string treated consistently (`@Email` allows empty? Reject non-email if non-blank or map `""` cleanly per `CreateCustomerRequest`: if `""` treat as `null` or validate email — confirm non-blank string must be valid email, blank/`""` -> reject or normalize; match React blank optional `<input>` behavior by validating non-empty email and mapping empty string `""` in optional text fields — verify in tests!). |
| `cnpOrTaxId` | `@Size(max=50)` | `null` | Overwritten (nullable) | String `<= 50` chars, trimmed, or `null`. |
| `dateOfBirth` | Optional `LocalDate` | `null` | **Preserved (not in `UpdateCustomerRequest`)** | Validated `YYYY-MM-DD` or `null`. |
| `livingCity` | Optional `String` (`length=100`) | `null` | **Preserved (not in `UpdateCustomerRequest`)** | Trimmed string `<= 100` chars or `null`. |
| `drivingLicenceNumber` | `@Size(max=50)` | `null` | Overwritten (nullable) | String `<= 50` chars, trimmed, or `null`. |
| `licenceCategories` | Optional `String` (`length=50`) | `"A,A2"` (if omitted/`null`) | **Only updated if non-null** (trimmed, `<= 50`) | Defaults to `"A,A2"` on create. |
| `licenceExpiryDate` | Optional `LocalDate` | `null` | Overwritten (nullable) | Validated `YYYY-MM-DD` or `null`. |
| `address` | Optional `String` | `null` | Overwritten (nullable) | `string` (trimmed) or `null`. |
| `gdprConsentDate` | Optional `LocalDate` | `todayUtc()` (if omitted/`null`) | **Preserved (not in `UpdateCustomerRequest`)** | Validated `YYYY-MM-DD`, defaults to `todayUtc()`. |
| `notes` | Optional `String` | `null` | Overwritten (nullable) | `string` or `null`. |

> **React Empty-String Optional Field Note:** In `web/src/App.tsx` lines 80–86, React `<Fields>` can submit `""` (empty string) for unfilled optional inputs like `email`, `cnpOrTaxId`, `licenceExpiryDate`. Note that `@Email` in Hibernate Validator treats `""` as valid while `@LocalDate` deserialization in Jackson treats `""` as `null`! Normalizing `""` to `null` for optional fields (`email`, `cnpOrTaxId`, `drivingLicenceNumber`, `licenceExpiryDate`, `dateOfBirth`, `livingCity`, `address`, `itpExpiryDate`, `rcaExpiryDate`, `cascoExpiryDate`) prevents React form submissions from failing with `400` on empty optional inputs while preserving `400` validation for invalid non-empty values (like `email: "bad-email"` or `licenceExpiryDate: "2026-02-30"`). Document this explicitly in `Validation` helpers and unit tests.

#### `CustomerDto` Response Shape
Exact Java fields ([CustomerDto.java](../../backend/src/main/java/ro/bikerental/modules/customer/dto/CustomerDto.java#L9-L26)):
```json
{
  "id": "uuid",
  "fullName": "Ion Popescu",
  "phone": "+40722123456",
  "email": "ion@example.com",
  "cnpOrTaxId": "1900101123456",
  "dateOfBirth": "1990-01-01",
  "livingCity": "Bucharest",
  "drivingLicenceNumber": "B1234567",
  "licenceCategories": "A,A2",
  "licenceExpiryDate": "2030-01-01",
  "address": "Str. Exemplu 1",
  "gdprConsentDate": "2026-11-16",
  "notes": null,
  "archived": false,
  "createdAt": "2026-11-16T00:00:00.000Z",
  "updatedAt": "2026-11-16T00:00:00.000Z"
}
```

### 4.4 Route 20 (`GET /api/v1/customers/{id}/balance-summary`) — Reusing `PaymentService`

- `CustomerController` in Firebase delegates `GET /api/v1/customers/:id/balance-summary` directly to the injected `PaymentService.getCustomerBalanceSummary(id)` ([payment.service.ts](../../backend-firebase/src/payment/payment.service.ts#L672-L729)), which returns `CustomerBalanceSummaryDto` (`customerId`, `customerName`, `balances: { RON, EUR, USD }`), validates UUID (`400`), and throws `404 NotFoundError('Customer', id)` if missing. **Zero duplicate calculation logic.**

---

## 5. Firestore Data Model, Backward Compatibility & Uniqueness Locks

### 5.1 Expanded Document Interfaces in `src/domain/types.ts`

```ts
export interface BikeDocument {
  id: string;
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  manufactureYear?: number;
  status: BikeStatus;
  isArchived: boolean;
  currentOdometer?: string;
  itpExpiryDate?: string | null;
  rcaExpiryDate?: string | null;
  cascoExpiryDate?: string | null;
  serviceIntervalDays?: number;
  nextServiceDueDate?: string | null;
  notes?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CustomerDocument {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  cnpOrTaxId?: string | null;
  dateOfBirth?: string | null;
  livingCity?: string | null;
  drivingLicenceNumber?: string | null;
  licenceCategories?: string | null;
  licenceExpiryDate?: string | null;
  address?: string | null;
  gdprConsentDate?: string | null;
  notes?: string | null;
  isArchived: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```

> **Backward Compatibility With Stages C3–C7:** New fields remain optional on the TypeScript interfaces so existing Stage C3–C7 tests and minimal fixtures continue compiling untouched, while the Stage C8 repository mapper (`bikeFrom`, `customerFrom`) supplies safe fallbacks (`manufactureYear = Number(data.manufactureYear ?? 0)` / `currentOdometer = '0.00'` / `serviceIntervalDays = 30` / `licenceCategories = null` / `Timestamp.fromMillis(0)` if timestamps omitted) and honors `data.isArchived === true || data.archived === true`.

### 5.2 Transactional SHA-256 Uniqueness Locks (`unique_keys`)

Matching [firestore-data-model.md](firestore-data-model.md#L42-L97) and Stage C5 `inventory.repository.ts`:

- **Lock ID Generators:**
  - `bikeRegLockId(regUpper)`: `` `bike_reg_${sha256(regUpper)}` `` (`fieldType: 'bike_registration_number'`)
  - `bikeVinLockId(vinUpper)`: `` `bike_vin_${sha256(vinUpper)}` `` (`fieldType: 'bike_vin'`)
  - `customerPhoneLockId(phoneTrimmed)`: `` `customer_phone_${sha256(phoneTrimmed)}` `` (`fieldType: 'customer_phone'`)
- **Create Transaction (Read-Before-Write):**
  - Read lock document(s) in Phase 1; throw `409 ConflictError` with exact Java message if lock exists:
    - `"Motorbike with registration number '<reg>' already exists"`
    - `"Motorbike with VIN '<vin>' already exists"`
    - `"Customer with phone number '<phone>' already exists"`
  - Write primary doc and lock doc(s) `{ id: lockId, fieldType, normalizedValue, entityId, createdAt: now }` atomically in Phase 3.
- **Update Transaction (`PUT /bikes/{id}`, `PUT /customers/{id}` — Read-Before-Write):**
  - Phase 1 reads: primary doc `bikes/{id}` / `customers/{id}`, old lock ref(s), new lock ref(s) (whenever value changed), and (for bikes) `active_rental_locks/{id}` -> if present & display fields changed, `rentals/{activeLock.rentalId}`.
  - Phase 2 guards:
    - Missing primary doc -> `404 NotFoundError`.
    - Duplicate lock conflict (`newLockSnap.exists && newLockSnap.data()?.entityId !== id`) -> `409 ConflictError`:
      - `"Another motorbike with registration number '<newReg>' already exists"`
      - `"Another motorbike with VIN '<newVin>' already exists"`
      - `"Another customer already has phone number '<newPhone>'"`
    - Active rental status guard (Section 3.1).
  - Phase 3 atomic writes: reserve new lock(s), release old lock(s) **only if changed and `oldLockSnap.exists && oldLockSnap.data()?.entityId === id`** (safe for legacy pre-C8 seeded docs without locks), update primary doc, and (for active rented bike display changes) update active rental snapshot.
- **Archive/Unarchive:** Locks are **never** released upon archiving (`firestore-data-model.md` line 95: PostgreSQL unique constraints persist across archived rows).

---

## 6. Pagination, Search, Read Budgets, and Required Firestore Indexes

### 6.1 `GET /api/v1/bikes` (Route 8) & `GET /api/v1/customers` (Route 15)

- **Pagination Defaults:** `page = 0`, `size = 20` (max `100`), `sort = 'createdAt'`, `direction = 'DESC'` via shared `parsePage` and `toPage`.
- **Bike Sort Allow-List:** `createdAt`, `updatedAt`, `registrationNumber`, `vin`, `make`, `model`, `manufactureYear`, `currentOdometer`, `serviceIntervalDays`, `nextServiceDueDate`, `status`. Note numeric sorting (`manufactureYear`, `currentOdometer` via `toMinorUnits`, `serviceIntervalDays`) vs lexicographical/timestamp sorting.
- **Customer Sort Allow-List:** `createdAt`, `updatedAt`, `fullName`, `phone`, `email`, `livingCity`.
- **Query Modes & Bounded Scan Safeguard (`MAX_SEARCH_SCAN_DOCS = 1000`):**
  1. **No substring `search` and indexed sort (`createdAt`) + equality filters (`includeArchived=false` -> `isArchived == false`, optional `status`):**
     Can execute indexed Firestore `.where(...).orderBy('createdAt', dir).limit(...)` directly with `.count().get()` for `totalElements`, **or** bounded repository scan (capped at `MAX_SEARCH_SCAN_DOCS + 1` throwing `422 UnprocessableEntityError` if exceeded) when sorting on non-indexed fields or applying substring `search`.
     - **Important Note for Legacy Seeded `bikes`/`customers`:** Docs without `createdAt` would be excluded by Firestore `.orderBy('createdAt')`! If bounded scan (`where('isArchived', '==', false)` when `!includeArchived`, no `orderBy`, fallback `Timestamp.fromMillis(0)` for missing `createdAt`) is used—consistent with `inventory.repository.ts` `pageParts` / `pageSuppliers`—both legacy docs without `createdAt` AND all 11 bike / 6 customer sort fields work seamlessly without exponential index explosion, while composite indexes still support direct indexed queries in `indexes.test.ts`!
  2. **Substring `search` matching:**
     - Bikes: `search.trim().toLowerCase()` matched against `registrationNumber`, `vin`, `make`, `model` (all case-insensitive).
     - Customers: `search.trim()` matched case-insensitively against `fullName` & `email`, and substring matched against `phone` & `cnpOrTaxId` (matches `CustomerRepository.java` lines 26–29; case-insensitive fallback on `phone`/`cnpOrTaxId` is harmless or exact `.includes`).

### 6.2 Required `firestore.indexes.json` Entries

Add composite indexes for `bikes` and `customers` (even though `FieldOverrides` stays `[]` for single-field queries):
- `bikes`:
  - `[isArchived ASC, createdAt DESC]`, `[isArchived ASC, createdAt ASC]`
  - `[status ASC, createdAt DESC]`, `[status ASC, createdAt ASC]`
  - `[isArchived ASC, status ASC, createdAt DESC]`, `[isArchived ASC, status ASC, createdAt ASC]`
- `customers`:
  - `[isArchived ASC, createdAt DESC]`, `[isArchived ASC, createdAt ASC]`

---

## 7. Testing & Acceptance Criteria

### 7.1 Unit Tests (`backend-firebase/tests/bike-customer.unit.test.ts`)
1. Validation & defaults for `CreateBikeRequest`, `UpdateBikeRequest`, `UpdateBikeStatusRequest`, `CreateCustomerRequest`, `UpdateCustomerRequest`, and search/pagination params (including `"" -> null` normalization for optional React fields, email lowercasing/validation, `manufactureYear` bounds `1990..2050`, `currentOdometer` `>= 0` precision, `phone` length `8..30`, `licenceCategories = "A,A2"`, `gdprConsentDate = todayUtc()`).
2. Deterministic SHA-256 lock ID helpers (`bikeRegLockId`, `bikeVinLockId`, `customerPhoneLockId`).
3. DTO mapping tests (`BikeDto` emitting `archived`, `manufactureYear`, `yearOfManufacture`, numeric `currentOdometer`, ISO dates/timestamps; `CustomerDto` emitting `archived`, ISO dates/timestamps; graceful handling of minimal legacy docs).
4. Pure search/filter/sort helpers (case-insensitive bike search, customer search across `fullName`/`phone`/`email`/`cnpOrTaxId`, `includeArchived` filtering, numeric vs string sorting) and `MAX_SEARCH_SCAN_DOCS = 1000` (`422`) safeguard.

### 7.2 Firestore Emulator Integration Tests (`backend-firebase/tests/bike-customer.test.ts`, plus `indexes.test.ts` & `run-tests.ts`)
1. **All 14 Routes Exercised Live (`Routes 7–20`):** Every bike and customer route tested against the Firestore Emulator.
2. **Authentication Matrix:** Unauthenticated/invalid/expired/revoked/inactive tokens -> `401`; both `ROLE_OWNER` and `ROLE_CUSTOMER` -> permitted (`200`/`201`, no `ownerMiddleware`).
3. **Transactional Uniqueness & Contention:**
   - Duplicate registration / VIN / phone on create -> `409 Conflict` with zero orphaned documents/locks.
   - Concurrent `POST /api/v1/bikes` (same reg or VIN) & `POST /api/v1/customers` (same phone) via `Promise.all` -> exactly 1 `201` and 1 `409`.
   - `PUT` updating reg/VIN/phone to a new unused value releases old lock (verified reusable afterwards) and reserves new lock; changing to another entity's locked value returns `409` cleanly without altering either entity; archiving retains uniqueness lock (`409` if reused while archived).
4. **Issue 1 – Active Rental / Lock Guards:**
   - Create rental via `POST /api/v1/rentals` -> verify `bike.status === 'RENTED'` and `active_rental_locks/{bikeId}` exists.
   - `PUT /api/v1/bikes/{id}` changing `status` to `AVAILABLE`/`IN_SERVICE`/`INACTIVE` -> `400`, bike stays `RENTED`, lock intact, subsequent `POST /api/v1/rentals/{id}/close` succeeds.
   - `PUT /api/v1/bikes/{id}` updating `notes`/`itpExpiryDate`/`registrationNumber` with omitted or `RENTED` status -> `200`, syncs `bikeRegistrationNumber` + `bikeMakeModel` on active rental without corrupting historical records.
   - `PATCH /api/v1/bikes/{id}/status` from `RENTED` -> `400`; from `AVAILABLE` to `IN_SERVICE` -> `200`.
   - `POST /api/v1/bikes/{id}/archive` when `RENTED` -> `400`; when `AVAILABLE` -> `200` (`archived: true, status: 'INACTIVE'`); `unarchive` -> `200` (`archived: false, status: 'AVAILABLE'`).
5. **Issue 2 – Customer Update & Historical Snapshots + Route 20 Reuse:**
   - Updating customer phone/name updates `customers/{id}`, swaps phone lock, preserves `dateOfBirth`/`livingCity`/`gdprConsentDate`, leaves past `rentals`/`payments` immutable, and `GET /api/v1/customers/{id}/balance-summary` reflects updated `customerName` matching `GET /api/v1/payments/balance-summary/{customerId}` and `404` for unknown customer.
6. **Search, Pagination & Read-Budget (`MAX_SEARCH_SCAN_DOCS`):**
   - `GET /api/v1/bikes` and `GET /api/v1/customers` filtering (`search`, `status`, `includeArchived`), pagination, sorting (`createdAt,DESC` default + numeric odometer sorting), and `indexes.test.ts` live index checks.

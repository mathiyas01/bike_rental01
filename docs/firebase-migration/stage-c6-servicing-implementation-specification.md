# Stage C6.0 – Servicing Contract Audit and Implementation Specification

**Status:** Stage C6.0 Contract Audit & Specification (Documentation Only — No Implementation in This Stage)  
**Target Codebase:** `backend-firebase/`  
**Authoritative Reference:** `backend/` (Java Spring Boot) and `backend/src/main/resources/db/migration/V1__init_schema.sql`

---

## 1. Executive Summary

This document defines the authoritative Firebase migration specification for **Stage C6 (Servicing Management)**, covering **5 HTTP endpoints** (Routes 53–57 in [api-compatibility-matrix.md](api-compatibility-matrix.md)) exposed by `ServicingController` at `/api/v1/services`, plus its transactional integration with **Stage C5 (Inventory)** and **Motorbikes** (`bikes`), and read contracts consumed by **Reports** (Routes 58, 60, 61).

### Key Architectural Decisions

1. **Direct Reuse of Stage C5 Inventory Helper (`prepareServicePartDeductionsInTx`):**
   `ServicingService.logService` (`POST /api/v1/services`) **must not** duplicate inventory validation, stock deduction, low-stock recalculation, or stock-ledger construction logic. Instead, it invokes `InventoryService.prepareServicePartDeductionsInTx` (`backend-firebase/src/inventory/inventory.service.ts`) during the Firestore transaction read phase, ensuring:
   - Strict read-before-write execution in `Promise.all` alongside `bikes/{motorbikeId}` and `app_users/{authenticatedUser.id}`.
   - Pre-validation aggregation of duplicate `partId` lines before checking `currentQuantity >= cumulativeRequested`.
   - Atomic updates to `parts/{partId}` (`currentQuantity`, `currentQuantityMinor`, `isLowStock`, `updatedAt`).
   - Atomic append-only `SERVICE_USAGE` entries in `stock_movements/{movementId}` (`referenceType: "SERVICE_RECORD"`, `referenceId: serviceRecordId`, `reason: "Used in service on motorbike " + bike.registrationNumber`).
   - Enforcement of `MAX_SERVICE_PARTS_ITEMS = 50` and `MAX_UNIQUE_SERVICE_PARTS = 50` (`422 UNPROCESSABLE_ENTITY`).
2. **Exact Fixed-Point `BigInt` Arithmetic:**
   - Labour costs and part unit costs use scale-2 `BigInt` minor units (`10^-2`, canonical `"0.00"` strings, JSON numbers via `moneyToJson`).
   - Spare-part line totals (`quantity * unitCost`, both scale 2) are computed in exact scale-4 `BigInt` units (`10^-4` = `quantityMinor * unitCostMinor`) so products like `1.25 * 10.05 = 12.5625` match `BigDecimal.multiply()` without binary floating-point rounding drift.
   - Odometer readings (`NUMERIC(10, 1)` in PostgreSQL) are compared and persisted using exact `BigInt` fixed-point arithmetic (no JS float comparison on odometer monotonicity).
3. **Dual Persistence for Service Part Usages:**
   Each consumed part line is written as an immutable `service_part_usage/{usageId}` document (preserving relational audit parity with `ServicePartUsageRepository`) **and** stored as a compact embedded `partsUsed` snapshot array inside `service_records/{serviceId}` (safe because Java exposes no endpoint to mutate `ServiceRecord` or `ServicePartUsage` after creation, avoiding N+1 child reads on Routes 54–57 and Stage C7 reports).
4. **Authentication Parity Without Over-Restriction:**
   All 5 routes use `createAuthMiddleware` only (**no `ownerMiddleware`**), matching `SecurityConfig` (`.anyRequest().authenticated()` with no `@PreAuthorize` on `ServicingController`). `POST /api/v1/services` also reads `app_users/{authenticatedUser.id}` inside the write transaction and rejects missing or inactive users with `401 UNAUTHORIZED`.
5. **Client Compatibility Alignment (`bikeRegistrationNumber` + `motorbikeRegistrationNumber`):**
   Java `ServiceRecordDto` and Flutter (`mobile/lib/features/servicing/models/service_model.dart`) read `bikeRegistrationNumber`, while React (`web/src/App.tsx` line 354) displays `motorbikeRegistrationNumber`. Emitting `bikeRegistrationNumber` alongside `motorbikeRegistrationNumber` with the identical registration value keeps both clients working seamlessly.

---

## 2. Source Files Inspected

### 2.1 Java Authoritative Reference (`backend/`)

| File Path | Role |
| :--- | :--- |
| `backend/src/main/java/ro/bikerental/modules/servicing/controller/ServicingController.java` | Defines Routes 53–57 (`/api/v1/services`) and pageable/date defaults. |
| `backend/src/main/java/ro/bikerental/modules/servicing/service/ServicingService.java` | Transactional `logService`, archive/odometer guards, due-date calculation, part deductions, and queries. |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/LogServiceRequest.java` | Bean Validation annotations, field defaults (`labourCost = 0`, `labourCurrency = "RON"`, `status = COMPLETED`, `partsUsed = []`). |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/LogServicePartItem.java` | Per-part request shape (`partId`, `quantity >= 0.01`, `unitCost >= 0`, `currency`). |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/ServiceRecordDto.java` | Response DTO mapping, `bikeMakeModel` concatenation, currency-filtered `partsCost` and `totalCost`. |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/ServicePartUsageDto.java` | Part-usage response DTO (`totalCost = quantity * unitCost`). |
| `backend/src/main/java/ro/bikerental/modules/servicing/entity/ServiceRecord.java` | JPA column definitions (`NUMERIC(10,1)` odometer, `NUMERIC(14,2)` labour, `ServiceStatus`). |
| `backend/src/main/java/ro/bikerental/modules/servicing/entity/ServicePartUsage.java` | JPA entity (`service_part_usage`, scale-2 quantity, scale-2 unitCost, currency). |
| `backend/src/main/java/ro/bikerental/modules/servicing/entity/ServiceStatus.java` | Enum: `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. |
| `backend/src/main/java/ro/bikerental/modules/servicing/repository/ServiceRecordRepository.java` | `findAllByBikeIdOrderByServiceDateDesc`, JPQL `searchServices`, JPQL `findDueServicesByDate`. |
| `backend/src/main/java/ro/bikerental/modules/servicing/repository/ServicePartUsageRepository.java` | Child usage queries by `serviceRecordId` / `partId`. |
| `backend/src/main/java/ro/bikerental/modules/bike/entity/Bike.java` | Confirms `currentOdometer` default `0`, `serviceIntervalDays` default `30`, `nextServiceDueDate`, `isArchived`. |
| `backend/src/main/java/ro/bikerental/modules/report/service/ReportService.java` | Cross-module servicing consumption for `getDateRangeReport` (Route 60) and `getBikeRoi` (Route 61). |
| `backend/src/main/java/ro/bikerental/common/security/SecurityConfig.java` | Verifies `.anyRequest().authenticated()` without owner-only restriction on `/api/v1/services/**`. |
| `backend/src/main/resources/db/migration/V1__init_schema.sql` | PostgreSQL `service_records` and `service_part_usage` table constraints and indexes. |
| `backend/src/test/java/ro/bikerental/modules/servicing/service/ServicingServiceTest.java` | Existing unit test expectations for `logService`, insufficient stock, odometer check, and next due date. |

### 2.2 Existing Firebase Backend & Client Consumers Inspected

| File Path | Role |
| :--- | :--- |
| `backend-firebase/src/inventory/inventory.service.ts` | Inspects `prepareServicePartDeductionsInTx` (lines 447–570) and returned `ServicePartDeductionPlan`. |
| `backend-firebase/src/inventory/inventory.validation.ts` | Inspects `parseServicePartsUsed`, `assertTransactionBudget`, and Stage C5 safeguard constants. |
| `backend-firebase/src/domain/types.ts` & `src/rental/rental.repository.ts` | Existing `BikeDocument` fields (`id`, `registrationNumber`, `vin`, `make`, `model`, `status`, `isArchived`). |
| `mobile/lib/core/api/api_endpoints.dart`, `mobile/lib/features/servicing/**` | Verifies Flutter endpoint `/api/v1/services`, `ServiceRecord`/`ServicePartUsage` JSON parsing, and request shape. |
| `web/src/App.tsx` | Verifies React table column `motorbikeRegistrationNumber` (line 354) and `POST /api/v1/services` payload. |

---

## 3. Complete Servicing API Contract (Routes 53–57)

All 5 servicing endpoints are mounted at `/api/v1/services` and enforce `createAuthMiddleware` only (**do not apply `ownerMiddleware`**).

### 3.1 Master Endpoint Summary Table

| Route # | Method | Path | Controller Method | Request Body / Params | Response Body | Success Status | Auth Requirement |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **53** | `POST` | `/api/v1/services` | `ServicingController.logService` | Body: `LogServiceRequest` | `ServiceRecordDto` | `201 Created` | Authenticated user (no `ownerMiddleware`) |
| **54** | `GET` | `/api/v1/services/{id}` | `ServicingController.getService` | Path: `id` (UUID) | `ServiceRecordDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **55** | `GET` | `/api/v1/services/bike/{bikeId}` | `ServicingController.getServicesForBike` | Path: `bikeId` (UUID) | `List<ServiceRecordDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **56** | `GET` | `/api/v1/services` | `ServicingController.searchServices` | Query: `bikeId?`, `status?`, `startDate?`, `endDate?`, `page=0`, `size=20`, `sort=serviceDate,DESC` | `PageResponse<ServiceRecordDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **57** | `GET` | `/api/v1/services/due` | `ServicingController.getDueServices` | Query: `asOfDate?` (`YYYY-MM-DD`) | `List<ServiceRecordDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |

> **Important Contract Facts:**
> 1. `ServicingController.java` exposes **no** update (`PUT`/`PATCH`) or delete (`DELETE`) or status-transition endpoints. Service records and part usages are immutable after creation.
> 2. **Express Route Precedence:** In `servicing.routes.ts`, `GET /due` and `GET /bike/:bikeId` **must** be registered before `GET /:id` so `"due"` is never captured as `{id}` (`400 VALIDATION_FAILED`).
> 3. **Clarification vs Earlier Stage C5.0 Cross-Module Reference (`/api/v1/services` vs `/api/v1/servicing`):** Earlier Stage C5.0 cross-module notes previously referred to `POST /api/v1/servicing`, which was a documentation typo (now corrected in `stage-c5-inventory-implementation-specification.md`). Direct inspection of `ServicingController.java` (`@RequestMapping("/api/v1/services")` at line 26, plus method mappings at lines 36, 46, 52, 58, 69), Flutter (`mobile/lib/core/api/api_endpoints.dart` line 48 & `service_provider.dart` lines 53, 73), React (`web/src/App.tsx` lines 303, 341), and `api-compatibility-matrix.md` (Routes 53–57, lines 118–122) confirms the authoritative backend base path is `/api/v1/services` (`/servicing` is only a frontend UI router path in Flutter/React).

---

### 3.2 `LogServiceRequest` (`POST /api/v1/services` — Route 53)

| Field | Java Type & Validation | Default (if omitted) | Firebase Validation & Handling |
| :--- | :--- | :--- | :--- |
| `motorbikeId` | `UUID`, `@NotNull` | Required | Valid UUID string (`400 VALIDATION_FAILED` if missing/invalid). Must exist in `bikes/{motorbikeId}` (`404 NOT_FOUND` otherwise). |
| `serviceDate` | `LocalDate`, `@NotNull` | Required | Validated `YYYY-MM-DD` calendar date via shared `parseDate`. |
| `odometerReading` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.0")` | Required | Finite non-negative decimal (`>= 0`, fits `NUMERIC(10,1)` max `999999999.9`). Reject `null`, negative, or `> 2` fractional digits (or `> 1` if strict `NUMERIC(10,1)` enforced — see §7). |
| `serviceProvider` | `String`, `@NotBlank`, `@Size(max = 150)` | Required | Non-blank string, max length `150`; stored as `serviceProvider.trim()`. |
| `workPerformed` | `String`, `@NotBlank` | Required | Non-blank string (`TEXT`); stored as `workPerformed.trim()`. |
| `labourCost` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.0")` | `BigDecimal.ZERO` (`"0.00"`) | If omitted -> `"0.00"`. If explicitly `null`, negative, non-finite, or `> 2` decimals -> `400 VALIDATION_FAILED`. Fits `DECIMAL(14,2)`. |
| `labourCurrency` | `String`, `@NotBlank`, `@Pattern("^(RON|EUR|USD)$")` | `"RON"` | If omitted -> `"RON"`. Otherwise must match `RON \| EUR \| USD` (`400 VALIDATION_FAILED` if invalid or explicit `null`). |
| `status` | `ServiceStatus` (no `@NotNull`) | `COMPLETED` | One of `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` (case-sensitive enum string, `400 VALIDATION_FAILED` otherwise). If omitted (or `null`), defaults to `"COMPLETED"`. |
| `nextServiceDueDate` | `LocalDate`, optional | `null` | Optional `YYYY-MM-DD` date or `null`. If `null`/omitted, computed in transaction as `addDays(serviceDate, bike.serviceIntervalDays ?? 30)`. |
| `nextServiceDueOdometer` | `BigDecimal`, optional | `null` | Optional non-negative decimal (`NUMERIC(10,1)`) or `null`. |
| `notes` | `String`, optional | `null` | Optional string or `null`. |
| `partsUsed` | `List<LogServicePartItem>`, optional | `[]` | Validated directly via `parseServicePartsUsed` from `inventory.validation.ts` (`MAX_SERVICE_PARTS_ITEMS = 50`, `MAX_UNIQUE_SERVICE_PARTS = 50`). |

---

### 3.3 `LogServicePartItem` (Nested Item inside `LogServiceRequest.partsUsed`)

| Field | Java Type & Validation | Handling via Stage C5 `parseServicePartsUsed` & `prepareServicePartDeductionsInTx` |
| :--- | :--- | :--- |
| `partId` | `UUID`, `@NotNull` | Valid UUID string; must exist in `parts/{partId}` (`404`) and have `isActive == true` (`400`). |
| `quantity` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.01")` | Scale-2 decimal `>= 0.01` (`DECIMAL(10,2)`). |
| `unitCost` | `BigDecimal`, `@DecimalMin("0.0")`, optional | If `null`/omitted -> fallback to `part.defaultUnitCost`. |
| `currency` | `String`, optional (Java field initializer `"RON"`, `ServicingService` falls back on `null`) | Validated against `RON \| EUR \| USD` when provided; if `null`/omitted, `prepareServicePartDeductionsInTx` falls back to `part.costCurrency` (see §7 item 3). |

---

### 3.4 `ServiceRecordDto` and `ServicePartUsageDto` Response Contracts

#### `ServiceRecordDto`

| JSON Property | Type | Nullable | Source / Calculation |
| :--- | :--- | :---: | :--- |
| `id` | `string` (UUID) | No | Document ID in `service_records`. |
| `bikeId` | `string` (UUID) | No | `bikes/{bikeId}` ID. |
| `bikeRegistrationNumber` | `string` | No | Snapshot of `bike.registrationNumber`. |
| `motorbikeRegistrationNumber` | `string` | No | Compatibility alias carrying the exact same string as `bikeRegistrationNumber` (consumed by `web/src/App.tsx`). |
| `bikeMakeModel` | `string` | No | `` `${bike.make} ${bike.model}` `` (matches `ServiceRecordDto.java` line 42). |
| `serviceDate` | `string` (`YYYY-MM-DD`) | No | Service date. |
| `odometerReading` | `number` | No | Service odometer reading as JSON number. |
| `serviceProvider` | `string` | No | Service provider name. |
| `workPerformed` | `string` | No | Description of maintenance work performed. |
| `labourCost` | `number` | No | Labour cost (`moneyToJson`). |
| `labourCurrency` | `"RON" \| "EUR" \| "USD"` | No | Labour currency. |
| `partsCost` | `number` | No | Sum of `usage.totalCost` **only for items where `usage.currency === labourCurrency`** (`0` if none match). |
| `totalCost` | `number` | No | `labourCost + partsCost` (in `labourCurrency`). |
| `status` | `ServiceStatus` | No | `PLANNED \| IN_PROGRESS \| COMPLETED \| CANCELLED`. |
| `nextServiceDueDate` | `string \| null` (`YYYY-MM-DD`) | Yes | Computed or explicit next due date. |
| `nextServiceDueOdometer` | `number \| null` | Yes | Optional next due odometer or `null`. |
| `notes` | `string \| null` | Yes | Optional notes or `null`. |
| `partsUsed` | `ServicePartUsageDto[]` | No | Ordered list of `ServicePartUsageDto` items (`[]` when no parts consumed). |
| `createdAt` | `string` (ISO-8601 UTC) | No | Creation timestamp (`Timestamp.toDate().toISOString()`). |

#### `ServicePartUsageDto`

| JSON Property | Type | Nullable | Source / Calculation |
| :--- | :--- | :---: | :--- |
| `id` | `string` (UUID) | No | `service_part_usage/{id}` document ID. |
| `partId` | `string` (UUID) | No | Referenced `parts/{partId}` ID. |
| `partCode` | `string` | No | Snapshot of `part.partCode`. |
| `partName` | `string` | No | Snapshot of `part.name`. |
| `quantity` | `number` | No | Consumed quantity (`moneyToJson`). |
| `unitCost` | `number` | No | Applied unit cost (`moneyToJson`). |
| `currency` | `"RON" \| "EUR" \| "USD"` | No | Applied currency. |
| `totalCost` | `number` | No | Exact `quantity * unitCost` (computed in scale-4 `BigInt`, serialized as finite JSON number). |

---

### 3.5 Query Endpoints (Routes 54–57) and Report Dependencies (Routes 58, 60, 61)

1. **`GET /api/v1/services/{id}` (Route 54):**
   - Validates `id` UUID (`400` if invalid). Returns `ServiceRecordDto` (`200`), or `404 NOT_FOUND` (`Service record not found: {id}`).
2. **`GET /api/v1/services/bike/{bikeId}` (Route 55):**
   - Validates `bikeId` UUID (`400` if invalid).
   - Queries `service_records` where `bikeId == :bikeId` ordered by `serviceDate DESC` (with deterministic tie-breaker).
   - **Verified Java Parity:** Does **not** verify bike existence in `bikes`; returns `200 OK` with `[]` if the bike has no service records or does not exist.
3. **`GET /api/v1/services` (Route 56):**
   - Query params:
     - `bikeId` (`UUID`, optional)
     - `status` (`ServiceStatus`, optional; `400 VALIDATION_FAILED` if invalid enum)
     - `startDate` (`YYYY-MM-DD`, optional; `serviceDate >= startDate`)
     - `endDate` (`YYYY-MM-DD`, optional; `serviceDate <= endDate`)
     - `page` (`0`), `size` (`20`), `sort` (default `serviceDate,DESC`)
   - Returns `PageResponse<ServiceRecordDto>`.
4. **`GET /api/v1/services/due` (Route 57):**
   - Query param: `asOfDate` (optional `YYYY-MM-DD`; defaults to `todayUtc()`).
   - Queries `service_records` where `nextServiceDueDate <= targetDate` ordered by `nextServiceDueDate ASC` (with deterministic tie-breaker).
   - **Verified Java Parity:** `ServiceRecordRepository.findDueServicesByDate` filters solely on `nextServiceDueDate <= :targetDate` (naturally excluding `null` due dates) without filtering by `status` or `bike.isArchived`.
5. **Cross-Module Report Consumption (Stage C7):**
   - `GET /api/v1/reports/date-range` (Route 60): reads `service_records` where `serviceDate` is within `[fromDate, toDate]` to sum `serviceCount`, `labourCost` by `labourCurrency`, and `sparePartsCost` from `partsUsed` (`quantity * unitCost` by `currency`).
   - `GET /api/v1/reports/bike-roi/{bikeId}` (Route 61): reads `service_records` for `bikeId` to sum `labourCost` + `partsUsed` costs by currency into `totalMaintenanceCost`.

---

## 4. Verified Java Business Rules

Every rule below was directly observed in `ServicingService.java`, `ServiceRecordDto.java`, and `ServicePartUsageDto.java`:

1. **Motorbike Existence & Archived Guard (`ServicingService.java`, lines 61–66):**
   - Looks up `bikes/{motorbikeId}`; throws `404 NOT_FOUND` (`Motorbike not found: {id}`) if missing.
   - If `bike.isArchived === true` -> throws `400 BAD_REQUEST` (`Cannot log service for an archived motorbike`).
   - **Verified Nuance:** Java does **not** check or restrict `bike.status` (`AVAILABLE`, `RENTED`, `IN_SERVICE`, `INACTIVE`), nor does `logService` change `bike.status`.
2. **Odometer Monotonicity & Conditional Update (`ServicingService.java`, lines 68–71, 160–162):**
   - If `request.odometerReading < bike.currentOdometer` -> throws `400 BAD_REQUEST` (`Service odometer reading (<req>) cannot be less than current motorbike odometer (<current>)`). Equal readings (`==`) are permitted.
   - On commit, if `request.odometerReading > bike.currentOdometer`, `bikes/{motorbikeId}.currentOdometer` is updated to `request.odometerReading`.
3. **Next Service Due Date Calculation (`ServicingService.java`, lines 102–104, 163):**
   - `effectiveNextDueDate = request.nextServiceDueDate ?? addDays(request.serviceDate, bike.serviceIntervalDays ?? 30)`.
   - Both `service_records/{id}.nextServiceDueDate` and `bikes/{motorbikeId}.nextServiceDueDate` are updated to `effectiveNextDueDate`.
4. **All Service Statuses Deduct Inventory (`ServicingService.java`, lines 84–157):**
   - Spare parts are validated and deducted whenever `partsUsed` is non-empty, regardless of `request.status` (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
5. **Parts Validation, Cumulative Deduction & Ledger Emission:**
   - Missing part -> `404 NOT_FOUND`.
   - Archived part (`!part.isActive`) -> `400 BAD_REQUEST` (`Cannot record stock movement for archived part: ${part.partCode}`).
   - Insufficient cumulative stock (after summing duplicate `partId` items) -> `400 BAD_REQUEST` with zero Firestore writes.
   - Emits one `service_part_usage/{usageId}` doc + one `stock_movements/{movementId}` doc (`movementType: "SERVICE_USAGE"`, `quantityDelta: "-" + quantity`, `referenceType: "SERVICE_RECORD"`, `referenceId: serviceRecordId`, `unitCost: item.unitCost ?? part.defaultUnitCost`, `currency: item.currency ?? part.costCurrency`, `reason: "Used in service on motorbike " + bike.registrationNumber`) per `LogServicePartItem`, while updating each distinct `parts/{partId}` document once.
6. **Currency-Isolated Cost Totals (`ServiceRecordDto.java`, lines 55–68):**
   - Each `ServicePartUsageDto.totalCost` = `quantity * unitCost` in its own `currency`.
   - `ServiceRecordDto.partsCost` sums **only** those `partsUsed` entries whose `currency` matches `labourCurrency` (`equalsIgnoreCase`), preventing invalid cross-currency addition.
   - `ServiceRecordDto.totalCost = labourCost + partsCost`.

---

## 5. Firestore Data Model

### 5.1 Collection: `service_records/{serviceId}` (`ServiceRecordDocument`)

| Field | Firestore Type | Constraints / Derivation |
| :--- | :--- | :--- |
| `id` | `string` (UUID v4) | Equals document ID `{serviceId}`. |
| `bikeId` | `string` (UUID v4) | References `bikes/{bikeId}`. |
| `bikeRegistrationNumber` | `string` | Snapshot from `bikes/{bikeId}.registrationNumber`. |
| `bikeMakeModel` | `string` | Snapshot `` `${bike.make} ${bike.model}` ``. |
| `serviceDate` | `DateString` (`YYYY-MM-DD`) | Validated date-only string. |
| `odometerReading` | `DecimalString` | Canonical decimal string (e.g., `"15000.0"` or `"15000.00"`). |
| `serviceProvider` | `string` | Trimmed provider name (`max 150`). |
| `workPerformed` | `string` | Trimmed work description. |
| `labourCost` | `DecimalString` | Canonical scale-2 string (e.g., `"120.00"`). |
| `labourCurrency` | `"RON" \| "EUR" \| "USD"` | Default `"RON"`. |
| `partsCost` | `DecimalString` | Derived scale-4/trimmed canonical decimal string (matching-currency sum). |
| `totalCost` | `DecimalString` | Derived `labourCost + partsCost` canonical decimal string. |
| `status` | `ServiceStatus` | `"PLANNED" \| "IN_PROGRESS" \| "COMPLETED" \| "CANCELLED"`. |
| `nextServiceDueDate` | `DateString` (`YYYY-MM-DD`) | Explicit or `addDays(serviceDate, serviceIntervalDays)`. |
| `nextServiceDueOdometer` | `DecimalString \| null` | Optional odometer target or `null`. |
| `notes` | `string \| null` | Optional notes or `null`. |
| `partsUsed` | `EmbeddedServicePartUsage[]` | Array (`<= 50` bounded items) of `{ id, partId, partCode, partName, quantity, unitCost, currency, totalCost }`. |
| `recordedByUserId` | `string` (UUID v4) | Audit reference to `app_users/{id}`. |
| `recordedByUserName` | `string` | Snapshot of `app_users/{id}.fullName`. |
| `createdAt` | `Timestamp` | Server-side transaction `Timestamp.now()`. |
| `updatedAt` | `Timestamp` | `Timestamp.now()`. |

### 5.2 Collection: `service_part_usage/{usageId}` (`ServicePartUsageDocument`)

Immutable child audit/query collection matching relational table `service_part_usage` (bounded by `MAX_SERVICE_PARTS_ITEMS = 50` per service record):

| Field | Firestore Type | Constraints / Derivation |
| :--- | :--- | :--- |
| `id` | `string` (UUID v4) | Equals document ID `{usageId}`. |
| `serviceRecordId` | `string` (UUID v4) | Parent `service_records/{serviceId}`. |
| `bikeId` | `string` (UUID v4) | Denormalized `bikes/{bikeId}` for per-bike/part reporting. |
| `partId` | `string` (UUID v4) | References `parts/{partId}`. |
| `partCode` | `string` | Snapshot from `parts/{partId}.partCode`. |
| `partName` | `string` | Snapshot from `parts/{partId}.name`. |
| `quantity` | `DecimalString` | Canonical scale-2 string. |
| `unitCost` | `DecimalString` | Canonical scale-2 string (`item.unitCost ?? part.defaultUnitCost`). |
| `currency` | `"RON" \| "EUR" \| "USD"` | Applied currency (`item.currency ?? part.costCurrency`). |
| `totalCost` | `DecimalString` | Exact scale-4 product `quantity * unitCost`. |
| `createdAt` | `Timestamp` | Same `Timestamp.now()` as parent `service_records/{serviceId}`. |

### 5.3 Collection: `bikes/{bikeId}` (`BikeDocument` Extensions)

`backend-firebase/src/domain/types.ts` currently defines `BikeDocument` for Stage C3 rentals (`id`, `registrationNumber`, `vin`, `make`, `model`, `status`, `isArchived`). Stage C6 extends `BikeDocument` with optional/defaulted maintenance fields persisted in `bikes/{bikeId}`:

- `currentOdometer?: string` (defaults to `"0.00"` when reading legacy/C3 test docs lacking the field, updated monotonically on `logService`)
- `serviceIntervalDays?: number` (defaults to `30` when absent or `<= 0`)
- `nextServiceDueDate?: string | null` (updated on every `logService`)
- `updatedAt?: Timestamp` (updated on every `logService`)

---

## 6. Transaction Workflow & Safeguards

### 6.1 Integration with `InventoryService.prepareServicePartDeductionsInTx`

Inside `firestore.runTransaction(async (tx) => ...)`, `POST /api/v1/services` executes strictly in this order:

1. **Pre-transaction:**
   - Parse & validate `LogServiceRequest` (`parseLogServiceInput(rawBody)`).
   - Validate `partsUsed` via Stage C5 `parseServicePartsUsed` (`MAX_SERVICE_PARTS_ITEMS = 50`, `MAX_UNIQUE_SERVICE_PARTS = 50` -> `422` immediately if exceeded).
2. **Read Phase (Parallel, All Reads Before Any Writes):**
   - Generate `now = Timestamp.now()` and `serviceRecordId = randomUUID()`.
   - Read `bikes/{input.motorbikeId}` (`tx.get`).
   - Read `app_users/{authenticatedUser.id}` (`tx.get`).
   - Wait for both reads first? **Important Subtlety on `prepareServicePartDeductionsInTx`:**
     Look closely at `prepareServicePartDeductionsInTx` signature (`backend-firebase/src/inventory/inventory.service.ts`, lines 447–456):
     ```ts
     prepareServicePartDeductionsInTx(tx, {
       rawPartsUsed,
       serviceRecordId,
       bikeRegistrationNumber,
       recordedByUserId,
       recordedByUserName,
       now,
     })
     ```
     Notice `prepareServicePartDeductionsInTx` **performs zero Firestore writes itself**—it reads `parts/{partId}` via `tx.getAll(...)` and returns `{ movements, plannedWrites, applyWrites }`. Because no writes occur until `applyWrites()`, calling:
     1. `[bikeSnap, userSnap] = await Promise.all([tx.get(bikeRef), tx.get(userRef)])`
     2. Validate `auditUser` (`401`), `bike` (`404`), `!bike.isArchived` (`400`), odometer `>= bike.currentOdometer` (`400`)
     3. `deductionPlan = await inventoryService.prepareServicePartDeductionsInTx(tx, { rawPartsUsed, serviceRecordId, bikeRegistrationNumber: bike.registrationNumber, recordedByUserId: auditUser.id, recordedByUserName: auditUser.fullName, now })`
     keeps **100% of `tx.get` / `tx.getAll` calls strictly before every `tx.set` / `tx.update`**, while still passing real `bike.registrationNumber` and `auditUser.fullName` cleanly into `stock_movements.reason` and `stock_movements.recordedByUserName`!
3. **Budget Safeguard Check Before Writes:**
   - Assemble servicing planned writes: `service_records/{serviceRecordId}` (`1`) + `bikes/{motorbikeId}` (`1`) + `service_part_usage/{usageId}` (`0..50`), concatenated with `deductionPlan.plannedWrites` (`0..100` for parts + movements).
   - Call `assertTransactionBudget(allPlannedWrites)` (`MAX_TRANSACTION_WRITES = 500`, `MAX_COMMIT_PAYLOAD_BYTES = 10_485_760`). Max possible writes for a 50-item service request is `2 + 50 + 50 + 50 = 152 << 500`.
4. **Write Phase (Atomic):**
   - `tx.set(serviceRecordRef, serviceRecordDoc)`
   - `tx.update(bikeRef, bikeUpdates)` (`nextServiceDueDate`, `updatedAt`, plus `currentOdometer` if strictly increased)
   - For each item in `servicePartUsages`: `tx.set(usageRef, usageDoc)`
   - Call `deductionPlan.applyWrites()` (updates each distinct `parts/{partId}` and creates each `stock_movements/{movementId}`).

### 6.2 Search & Read-Volume Safeguards

| Safeguard Constant | Value | Applies To | Behaviour When Exceeded |
| :--- | :---: | :--- | :--- |
| `MAX_SERVICE_PARTS_ITEMS` | `50` | `POST /api/v1/services` `partsUsed` | Enforced in `parseServicePartsUsed` -> `422 UNPROCESSABLE_ENTITY`. |
| `MAX_UNIQUE_SERVICE_PARTS` | `50` | Distinct `partId` values in `partsUsed` | Enforced in `parseServicePartsUsed` -> `422 UNPROCESSABLE_ENTITY`. |
| `MAX_TRANSACTION_WRITES` | `500` | Combined servicing + inventory writes | Enforced via `assertTransactionBudget` -> `422 UNPROCESSABLE_ENTITY`. |
| `MAX_COMMIT_PAYLOAD_BYTES` | `10_485_760` (10 MiB) | Combined commit payload | Enforced via `assertTransactionBudget` -> `422 UNPROCESSABLE_ENTITY`. |
| `MAX_SEARCH_SCAN_DOCS` | `1000` | Custom dynamic `sort` fallback on `GET /api/v1/services` | When `sort` is `serviceDate` (default), native Firestore `count()` + indexed `startAfter` handles unlimited docs. When a non-indexed `sort` field is requested, bounded scan `<= 1000` avoids `FAILED_PRECONDITION` (`422` if exceeded). |

---

## 7. API Compatibility Requirements and Documented Deviations

| # | Area | Java Spring Boot Behaviour | Stage C6 Firebase Requirement / Deviation | Rationale |
| :-: | :--- | :--- | :--- | :--- |
| **1** | Audit-user resolution in `logService` | Falls back to `appUserRepository.findAll().stream().findFirst()` when `userId` is null or missing (`ServicingService.java`, lines 73–80). | Read `app_users/{authenticatedUser.id}` inside the transaction; reject missing or inactive user with `401 UNAUTHORIZED`. | Consistent with Stage C4 & C5 security parity; removes dev user fallback. |
| **2** | Duplicate `partId` in `partsUsed` | Validation loop checks each line individually against initial stock; duplicate-item overdraft hits DB `CHECK` constraint (500) during flush (`ServicingService.java`, lines 85–99). | Reuses `prepareServicePartDeductionsInTx`, which aggregates `totalRequestedMinorByPartId` before writes and returns clean `400 BAD_REQUEST`. | Prevents negative stock corruption without DB `CHECK` constraints. |
| **3** | Omitted vs explicit `null` `currency` on `partsUsed[]` item | `LogServicePartItem` initializes `currency = "RON"` (omitted -> `"RON"`, explicit `null` -> `part.costCurrency`), whereas `parseServicePartsUsed` in Stage C5 sets both omitted and `null` -> `null` (falling back to `part.costCurrency`). | **Reuse Stage C5 `parseServicePartsUsed` & `prepareServicePartDeductionsInTx` directly:** omitted/`null` currency falls back to `part.costCurrency` unless explicitly specified (`RON\|EUR\|USD`). Note: both Flutter and React always explicitly populate `part.costCurrency`. | Avoids duplicating or modifying the already-tested Stage C5 inventory helper. |
| **4** | `bikeRegistrationNumber` vs `motorbikeRegistrationNumber` | Java `ServiceRecordDto` & Flutter read `bikeRegistrationNumber`; React `web/src/App.tsx` (line 354) references `motorbikeRegistrationNumber`. | Emit **both** `bikeRegistrationNumber` and `motorbikeRegistrationNumber` with the identical value on `ServiceRecordDto`. | Zero breaking changes for Java/Flutter or React dashboard. |
| **5** | Odometer scale precision (`NUMERIC(10,1)` vs `scale <= 2`) | PostgreSQL column is `NUMERIC(10,1)`; `LogServiceRequest` has no `@Digits` annotation (only `@DecimalMin("0.0")`). | Validate non-negative finite decimal `scale <= 2` (using existing `parseStrictMoney` / `BigInt` minor units) with upper bound matching `999,999,999.9` (`<= 99_999_999_990n`), rejecting `> 2` decimals or negative values with `400 VALIDATION_FAILED`. | Preserves integer/tenths/two-decimal compatibility without float comparison bugs. |
| **6** | Missing `currentOdometer` / `serviceIntervalDays` on legacy `bikes/{id}` | Columns are `NOT NULL` in PostgreSQL (`DEFAULT 0`, `DEFAULT 30`). | When `bikes/{bikeId}` omits `currentOdometer` or `serviceIntervalDays` (e.g., Stage C3 test fixtures), default in-service read to `"0.00"` and `30` days respectively. | Ensures smooth interop with existing Stage C3 `bikes` test data. |

---

## 8. Required Firestore Indexes (`firestore.indexes.json`)

### 8.1 Automatic Single-Field vs Composite Indexes

Per Firestore rules, **do not** add single-field indexes to `firestore.indexes.json`:
- Unfiltered `GET /api/v1/services` (`sort=serviceDate,DESC/ASC`, including `startDate`/`endDate` range) uses Firestore's automatic single-field index on `serviceDate`.
- `GET /api/v1/services/due` (`where('nextServiceDueDate', '<=', targetDate).orderBy('nextServiceDueDate', 'asc')`) uses Firestore's automatic single-field index on `nextServiceDueDate`.

Keep `"fieldOverrides": []` untouched.

### 8.2 Composite Indexes Required for Stage C6

| Collection | Index Fields | Queries Served |
| :--- | :--- | :--- |
| `service_records` | `bikeId ASC`, `serviceDate DESC` | Route 55 (`GET /bike/{bikeId}`) and Route 56 (`?bikeId=...`, `sort=serviceDate,DESC`, optional `startDate`/`endDate`). |
| `service_records` | `bikeId ASC`, `serviceDate ASC` | Route 56 (`?bikeId=...`, `sort=serviceDate,ASC`, optional date range). |
| `service_records` | `status ASC`, `serviceDate DESC` | Route 56 (`?status=...`, `sort=serviceDate,DESC`, optional date range). |
| `service_records` | `status ASC`, `serviceDate ASC` | Route 56 (`?status=...`, `sort=serviceDate,ASC`, optional date range). |
| `service_records` | `bikeId ASC`, `status ASC`, `serviceDate DESC` | Route 56 (`?bikeId=...&status=...`, `sort=serviceDate,DESC`, optional date range). |
| `service_records` | `bikeId ASC`, `status ASC`, `serviceDate ASC` | Route 56 (`?bikeId=...&status=...`, `sort=serviceDate,ASC`, optional date range). |

*(Dynamic non-`serviceDate` sort fields on Route 56, e.g. `sort=odometerReading,DESC` or `sort=labourCost,DESC` or `sort=status,ASC`, use equality pre-filters + bounded scan `<= MAX_SEARCH_SCAN_DOCS` and deterministic in-memory sorting so queries never fail with `FAILED_PRECONDITION`.)*

---

## 9. Emulator Testing Plan & Stage C6.1 Implementation Sequence

### 9.1 Required Test Coverage (Stage C6.1)

1. **Unit Tests (`tests/servicing.unit.test.ts`):**
   - `LogServiceRequest` validation: required fields, `odometerReading >= 0`, `labourCost >= 0`, `labourCurrency` regex, `status` enum + `"COMPLETED"` default, `notes`/`nextServiceDueOdometer` optional handling, `nextServiceDueDate` calendar validation.
   - Fixed-point scale-4 `BigInt` line-total math (`1.25 * 10.05 = 12.5625`), currency-isolated `partsCost` calculation (mixed `EUR` + `RON` parts when `labourCurrency = "RON"` excludes `EUR` parts from `partsCost`), and `totalCost = labourCost + partsCost`.
   - `ServiceRecordDto` serialization (both `bikeRegistrationNumber` and `motorbikeRegistrationNumber`, `bikeMakeModel`).
   - Query parsing (`parseServiceSearchQuery`, `parseDueDateQuery`).
2. **Emulator Integration Tests (`tests/servicing.test.ts` & `tests/indexes.test.ts`):**
   - **5-Route Auth & Role Matrix (Routes 53–57):** missing, malformed, expired, wrong-secret, revoked (`authVersion` & `tokenIssuedBefore`), missing `app_users/{id}`, and inactive `app_users/{id}` all return `401`; valid `ROLE_CUSTOMER` token succeeds across all 5 routes (never `403`).
   - **Core Servicing Business Rules:**
     - Missing bike -> `404`; archived bike -> `400`; lower odometer than `bike.currentOdometer` -> `400` with zero writes; equal odometer allowed; higher odometer advances `bike.currentOdometer`.
     - Explicit `nextServiceDueDate` vs fallback `serviceDate + bike.serviceIntervalDays` persisted on both `service_records` and `bikes`.
     - All 4 `ServiceStatus` values (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) persist usages, deduct stock, and emit `SERVICE_USAGE` stock movements atomically.
     - Single & multi-currency `partsUsed` calculation (`partsCost` currency isolation, `totalCost`).
     - Duplicate `partId` cumulative stock check (`[qty 3, qty 3]` against stock `5` -> `400`, zero mutations on `parts`, `stock_movements`, `bikes`, `service_records`, `service_part_usage`), valid duplicate lines -> `201` with single net update on `parts/{partId}` and two immutable `service_part_usage` + `stock_movements` documents, updating `lowStock` & `currentQuantityMinor`.
     - Archived part in `partsUsed` -> `400`; missing part -> `404`; `> 50` items in `partsUsed` -> `422`.
     - Concurrency contention (`Promise.all` two parallel services consuming more combined stock or conflicting on odometer): serializes safely without negative stock or lost ledger entries.
     - Route 55 (`/bike/:bikeId`, including unknown bike returning `[]`), Route 56 (all filter combinations `bikeId`, `status`, `startDate`, `endDate`, pagination, custom sort), Route 57 (`/due` inclusive `<= asOfDate` ASC ordering).
   - **Indexes (`tests/indexes.test.ts`):** Verify all 6 `service_records` composite indexes in `firestore.indexes.json` and execute live Firestore Emulator filter/sort matrix across all `(bikeId?, status?, startDate/endDate?, ASC/DESC)` combinations.

### 9.2 Implementation Sequence for Stage C6.1 (Upon Approval)

1. Extend `backend-firebase/src/domain/types.ts` with `ServiceStatus`, `ServiceRecordDocument`, `ServicePartUsageDocument`, and `BikeDocument` servicing fields.
2. Add the 6 `service_records` composite indexes to `backend-firebase/firestore.indexes.json`.
3. Implement `backend-firebase/src/servicing/servicing.types.ts` and `servicing.validation.ts`.
4. Implement `backend-firebase/src/servicing/servicing.repository.ts` and `servicing.service.ts` (injecting/calling `InventoryService.prepareServicePartDeductionsInTx`).
5. Implement `backend-firebase/src/controllers/servicing.controller.ts`, `src/routes/servicing.routes.ts`, and register `/api/v1/services` in `src/app.ts`.
6. Add tests in `tests/indexes.test.ts`, `tests/servicing.unit.test.ts`, `tests/servicing.test.ts`, register in `tests/run-tests.ts`, and verify with `npm run typecheck`, `npm run build`, `npm test`, **3 consecutive runs** of `npm run test:emulator`, `npm audit --omit=dev`, and `git diff --check`.

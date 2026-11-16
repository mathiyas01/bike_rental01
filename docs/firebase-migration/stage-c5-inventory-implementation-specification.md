# Stage C5.0 – Inventory Contract Audit and Implementation Specification

**Status:** Stage C5.0 Contract Audit & Specification (Documentation Only — No Implementation in This Stage)  
**Target Codebase:** `backend-firebase/`  
**Authoritative Reference:** `backend/` (Java Spring Boot) and `backend/src/main/resources/db/migration/V1__init_schema.sql`

---

## 1. Executive Summary

This document defines the authoritative Firebase migration specification for **Stage C5 (Inventory Management)**, covering **15 inventory HTTP endpoints** (Routes 38–52 in `docs/firebase-migration/api-compatibility-matrix.md`) across three Java controllers:

- **Parts (`PartController` — `/api/v1/parts`):** 7 endpoints (Routes 38–44) for part creation, metadata/threshold updates, single-part retrieval, filtered/paginated listing, active low-stock listing, archiving, and unarchiving.
- **Stock Movements (`StockMovementController` — `/api/v1/stock-movements`):** 3 endpoints (Routes 45–47) for recording stock ledger movements and querying movement history by part or filtered date range.
- **Suppliers (`SupplierController` — `/api/v1/suppliers`):** 5 endpoints (Routes 48–52) for supplier creation, filtered/paginated listing, single-supplier retrieval, archiving, and unarchiving.

This specification also documents the verified cross-module boundaries with **Servicing** (`POST /api/v1/services` — Route 53 in `ServicingService.logService`, which consumes spare parts and emits `SERVICE_USAGE` stock movements) and **Reports** (`GET /api/v1/reports/dashboard` — Route 58 and `GET /api/v1/reports/date-range` — Route 60).

### Key Architectural Decisions

1. **Append-Only Stock Ledger:** `stock_movements/{movementId}` documents are strictly immutable once created. Stock corrections and reversals append new ledger entries and atomically adjust `parts/{partId}.currentQuantity`. Ledger history is never deleted or overwritten.
2. **Exact Fixed-Point `BigInt` Arithmetic & Canonical Decimal Strings:** Both quantities (`precision = 10, scale = 2` in PostgreSQL) and monetary unit costs (`precision = 14, scale = 2` in PostgreSQL) are processed in TypeScript using `BigInt` minor units (`scale = 2`), stored in Firestore as canonical two-decimal strings (e.g., `"15.00"`, `"-2.50"`), and serialized in HTTP JSON responses as JSON numbers via `toJsonNumber()`.
3. **Derived Firestore Fields for SQL Query Parity:**
   - `isLowStock: boolean` (`toMinorUnits(currentQuantity) <= toMinorUnits(minReorderLevel)`) is maintained atomically on every `parts/{partId}` write to replace PostgreSQL's column-to-column predicate `p.current_quantity <= p.min_reorder_level`.
   - `currentQuantityMinor: number` (`Number(toMinorUnits(currentQuantity))`) is maintained atomically on every `parts/{partId}` write so `GET /api/v1/parts/low-stock` (`ORDER BY p.currentQuantity ASC`) and numeric sorting sort numerically rather than lexicographically (`"2.00"` before `"10.00"`).
   - `nameNormalized: string` (`name.trim().toLowerCase()`) on `suppliers/{supplierId}` supports case-insensitive ordering and lookup parity.
4. **Atomic Uniqueness Locks:** Case-insensitive uniqueness for `parts.partCode` (normalized uppercase) and `suppliers.name` (normalized lowercase) is enforced transactionally via `unique_keys/part_code_{sha256}` and `unique_keys/supplier_name_{sha256}`.
5. **Authentication Parity Without Role Over-Restriction:** All 15 inventory routes enforce `createAuthMiddleware` only (requiring a valid Firebase/JWT session and an active `app_users/{id}` document) without applying `ownerMiddleware`, matching Java `SecurityConfig` (`anyRequest().authenticated()` with no `@PreAuthorize` on any inventory controller).
6. **Verified Serialization & Validation Nuances Captured Upfront:**
   - Java Jackson serializes `PartDto.isLowStock()` (`boolean`) on the wire as `"lowStock"` (verified in `mobile/lib/features/inventory/models/part_model.dart`). Firebase `PartDto` emits `"lowStock"` and includes `"isLowStock"` as an alias so both the mobile client and Stage A matrix consumers succeed.
   - `RecordStockMovementRequest.quantity` carries `@DecimalMin("0.01")` in Java, meaning HTTP requests with zero or negative quantities are rejected with `400 VALIDATION_FAILED` even for `ADJUSTMENT` or `REVERSAL`.
   - `ServicingService.logService` must aggregate duplicate `partId` items before checking stock availability in Firestore transactions.

---

## 2. Java Source Files Inspected

Every contract and business rule in this specification is backed by direct inspection of the following files:

### 2.1 Inventory Module (`backend/src/main/java/ro/bikerental/modules/inventory/`)

| File Path | Role |
| :--- | :--- |
| `controller/PartController.java` | Defines Routes 38–44 (`/api/v1/parts`) and request parameter defaults. |
| `controller/StockMovementController.java` | Defines Routes 45–47 (`/api/v1/stock-movements`) and `@DateTimeFormat(ISO.DATE_TIME)` parsing. |
| `controller/SupplierController.java` | Defines Routes 48–52 (`/api/v1/suppliers`); confirms no `PUT /{id}` route exists. |
| `service/PartService.java` | Part creation, initial setup movement, updates, filtering/search, low-stock query, archive/unarchive. |
| `service/StockMovementService.java` | Signed quantity delta calculation, non-negative stock check, cost/currency fallback, search. |
| `service/SupplierService.java` | Case-insensitive supplier uniqueness, search, archive/unarchive. |
| `repository/PartRepository.java` | `existsByPartCodeIgnoreCase`, `findLowStockParts`, JPQL `searchParts`. |
| `repository/StockMovementRepository.java` | `findAllByPartIdOrderByCreatedAtDesc`, JPQL `searchMovements`. |
| `repository/SupplierRepository.java` | `existsByNameIgnoreCase`, JPQL `searchSuppliers`. |
| `entity/Part.java` | Entity normalization (`partCode`, `category`, `unitOfMeasure`), column precision/scale, `isLowStock` logic. |
| `entity/StockMovement.java` | Ledger fields, nullable `referenceType`/`referenceId`/`reason`, mandatory `recordedByUser`. |
| `entity/StockMovementType.java` | Enum values: `STOCK_IN`, `STOCK_OUT`, `SERVICE_USAGE`, `RETURN`, `ADJUSTMENT`, `REVERSAL`. |
| `entity/Supplier.java` | Supplier fields and defaults (`active = true`). |
| `dto/CreatePartRequest.java` | Validation constraints (`@NotBlank`, `@Size`, `@NotNull`, `@DecimalMin`, `@Pattern`) and defaults. |
| `dto/UpdatePartRequest.java` | Mutable vs immutable fields on `PUT /api/v1/parts/{id}`. |
| `dto/PartDto.java` | Response DTO shape and `boolean isLowStock()` Jackson getter semantics. |
| `dto/RecordStockMovementRequest.java` | Validation (`@DecimalMin("0.01")` on `quantity`), optional `unitCost`, default `"RON"` currency. |
| `dto/StockMovementDto.java` | Ledger response DTO shape and `recordedByUserName` mapping. |
| `dto/CreateSupplierRequest.java` | Supplier request validation (`@NotBlank`, `@Size`; no `@Email` annotation). |
| `dto/SupplierDto.java` | Supplier response DTO shape. |

### 2.2 Cross-Module, Security, Schema, Exception, Test, and Client Files Inspected

| File Path | Role |
| :--- | :--- |
| `backend/src/main/java/ro/bikerental/modules/servicing/controller/ServicingController.java` | Exposes `POST /api/v1/services` (Route 53). |
| `backend/src/main/java/ro/bikerental/modules/servicing/service/ServicingService.java` | `logService` spare-part validation, stock deduction, and `SERVICE_USAGE` movement emission. |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/LogServiceRequest.java` | `partsUsed` list contract on service logging. |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/LogServicePartItem.java` | Per-item `partId`, `quantity` (`@DecimalMin("0.01")`), optional `unitCost`/`currency`. |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/ServiceRecordDto.java` | Embeds `List<ServicePartUsageDto> partsUsed`. |
| `backend/src/main/java/ro/bikerental/modules/servicing/dto/ServicePartUsageDto.java` | Part usage response DTO inside servicing records. |
| `backend/src/main/java/ro/bikerental/modules/servicing/entity/ServicePartUsage.java` | Relational part-usage persistence model. |
| `backend/src/main/java/ro/bikerental/modules/report/service/ReportService.java` | Consumes `findLowStockParts()` (Route 58) and aggregates `stock_movements` in `[fromDate, toDate]` (Route 60). |
| `backend/src/main/java/ro/bikerental/modules/report/dto/DashboardKpiDto.java` | Defines `lowStockPartsCount`. |
| `backend/src/main/java/ro/bikerental/common/security/SecurityConfig.java` | Verifies `.anyRequest().authenticated()` without role restrictions on inventory routes. |
| `backend/src/main/java/ro/bikerental/common/exception/GlobalExceptionHandler.java` | Maps exceptions to `ApiErrorResponse` HTTP status codes and error codes. |
| `backend/src/main/java/ro/bikerental/common/exception/BusinessException.java` | Maps business rule violations to HTTP `400 BAD_REQUEST`. |
| `backend/src/main/java/ro/bikerental/common/exception/ConflictException.java` | Extends `BusinessException` with HTTP `409 CONFLICT`. |
| `backend/src/main/java/ro/bikerental/common/exception/ResourceNotFoundException.java` | Maps missing entities to HTTP `404 NOT_FOUND`. |
| `backend/src/main/resources/db/migration/V1__init_schema.sql` | Authoritative PostgreSQL column types, constraints, `CHECK (current_quantity >= 0)`, and table indexes. |
| `backend/src/test/java/ro/bikerental/modules/inventory/service/PartServiceTest.java` | Existing Java unit test expectations for `PartService`. |
| `backend/src/test/java/ro/bikerental/modules/inventory/service/StockMovementServiceTest.java` | Existing Java unit test expectations for `StockMovementService`. |
| `backend/src/test/java/ro/bikerental/modules/servicing/service/ServicingServiceTest.java` | Existing Java unit test expectations for servicing stock deduction. |
| `backend/src/test/java/ro/bikerental/common/security/SecurityIntegrationTest.java` | Security integration test baseline. |
| `mobile/lib/features/inventory/models/part_model.dart` | Confirms Flutter reads `json['lowStock']`. |
| `mobile/lib/features/inventory/screens/inventory_screen.dart` | Reveals mobile UI sends non-Java movement types (`'PURCHASE'`, `'USAGE_NON_SERVICE'`). |
| `web/src/App.tsx` | Confirms React web UI sends `'STOCK_IN'`. |
| `backend-firebase/src/domain/types.ts`, `src/shared/money.ts`, `src/shared/pagination.ts`, `firestore.indexes.json` | Existing Firebase shared utilities, domain types, and Stage C3/C4 index conventions. |

---

## 3. Complete Inventory API Contract

### 3.1 Master Endpoint Summary Table (Routes 38–52)

All 15 inventory routes require an authenticated user (`createAuthMiddleware` only; **do NOT apply `ownerMiddleware`**). All roles (`ROLE_OWNER`, `ROLE_ADMIN`, `ROLE_STAFF`, `ROLE_CUSTOMER`) are permitted when authenticated.

| Route # | Method | Path | Controller Method | Request Body / Params | Response Body | Success Status | Auth Requirement |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **38** | `POST` | `/api/v1/parts` | `PartController.createPart` | Body: `CreatePartRequest` | `PartDto` | `201 Created` | Authenticated user (no `ownerMiddleware`) |
| **39** | `PUT` | `/api/v1/parts/{id}` | `PartController.updatePart` | Path: `id` (UUID); Body: `UpdatePartRequest` | `PartDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **40** | `GET` | `/api/v1/parts/{id}` | `PartController.getPart` | Path: `id` (UUID) | `PartDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **41** | `GET` | `/api/v1/parts` | `PartController.listParts` | Query: `search`, `category`, `lowStockOnly`, `includeArchived=false`, `page=0`, `size=20`, `sort=partCode,ASC` | `PageResponse<PartDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **42** | `GET` | `/api/v1/parts/low-stock` | `PartController.getLowStockParts` | None | `List<PartDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **43** | `POST` | `/api/v1/parts/{id}/archive` | `PartController.archivePart` | Path: `id` (UUID) | `PartDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **44** | `POST` | `/api/v1/parts/{id}/unarchive` | `PartController.unarchivePart` | Path: `id` (UUID) | `PartDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **45** | `POST` | `/api/v1/stock-movements` | `StockMovementController.recordStockMovement` | Body: `RecordStockMovementRequest` | `StockMovementDto` | `201 Created` | Authenticated user (no `ownerMiddleware`) |
| **46** | `GET` | `/api/v1/stock-movements/part/{partId}` | `StockMovementController.getMovementsForPart` | Path: `partId` (UUID) | `List<StockMovementDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **47** | `GET` | `/api/v1/stock-movements` | `StockMovementController.searchStockMovements` | Query: `partId`, `type`, `startDate`, `endDate`, `page=0`, `size=20`, `sort=createdAt,DESC` | `PageResponse<StockMovementDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **48** | `POST` | `/api/v1/suppliers` | `SupplierController.createSupplier` | Body: `CreateSupplierRequest` | `SupplierDto` | `201 Created` | Authenticated user (no `ownerMiddleware`) |
| **49** | `GET` | `/api/v1/suppliers` | `SupplierController.listSuppliers` | Query: `search`, `includeArchived=false`, `page=0`, `size=20`, `sort=name,ASC` | `PageResponse<SupplierDto>` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **50** | `GET` | `/api/v1/suppliers/{id}` | `SupplierController.getSupplier` | Path: `id` (UUID) | `SupplierDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **51** | `POST` | `/api/v1/suppliers/{id}/archive` | `SupplierController.archiveSupplier` | Path: `id` (UUID) | `SupplierDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |
| **52** | `POST` | `/api/v1/suppliers/{id}/unarchive` | `SupplierController.unarchiveSupplier` | Path: `id` (UUID) | `SupplierDto` | `200 OK` | Authenticated user (no `ownerMiddleware`) |

> **Important Contract Fact:** `SupplierController.java` does **not** expose `PUT /api/v1/suppliers/{id}` or any supplier update endpoint. Stage C5.1 must not invent an undocumented supplier update route.

> **Route Precedence Note in Express:** In `part.controller.ts`, `GET /low-stock` MUST be registered **before** `GET /:id` so `"low-stock"` is never captured as `{id}`. Similarly, in `stock-movement.controller.ts`, `GET /part/:partId` must be clearly routed without shadowing `GET /`.

---

### 3.2 `CreatePartRequest` (`POST /api/v1/parts` — Route 38)

| Field | Java Type & Validation | Default (if omitted) | Firebase Validation & Handling |
| :--- | :--- | :--- | :--- |
| `partCode` | `String`, `@NotBlank`, `@Size(max = 50)` | Required | Non-blank string, max length `50` after validation; normalized to `partCode.trim().toUpperCase()`. |
| `name` | `String`, `@NotBlank`, `@Size(max = 150)` | Required | Non-blank string, max length `150`; stored as `name.trim()`. |
| `category` | `String`, `@NotBlank`, `@Size(max = 50)` | Required | Non-blank string, max length `50`; normalized to `category.trim().toUpperCase()`. |
| `description` | `String`, optional | `null` | Optional string or `null`. |
| `unitOfMeasure` | `String`, `@NotBlank`, `@Size(max = 20)` | `"PCS"` | If omitted, defaults to `"PCS"`. If provided (including `null` or whitespace), must be non-blank, max length `20`, normalized to `.trim().toUpperCase()`. |
| `initialQuantity` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.0")` | `BigDecimal.ZERO` (`0`) | If omitted, defaults to `"0.00"`. If explicitly `null` -> `400 VALIDATION_FAILED`. Accepts finite JSON number or numeric string (`scale <= 2`, `>= 0.00`, fits `DECIMAL(10,2)`). |
| `minReorderLevel` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.0")` | `BigDecimal.valueOf(2.0)` (`2.0`) | If omitted, defaults to `"2.00"`. If explicitly `null` -> `400 VALIDATION_FAILED`. Accepts finite JSON number or numeric string (`scale <= 2`, `>= 0.00`, fits `DECIMAL(10,2)`). |
| `defaultUnitCost` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.0")` | `BigDecimal.ZERO` (`0`) | If omitted, defaults to `"0.00"`. If explicitly `null` -> `400 VALIDATION_FAILED`. Accepts finite JSON number or numeric string (`scale <= 2`, `>= 0.00`, fits `DECIMAL(14,2)`). |
| `costCurrency` | `String`, `@NotBlank`, `@Pattern("^(RON|EUR|USD)$")` | `"RON"` | If omitted, defaults to `"RON"`. Must match `RON \| EUR \| USD`. |
| `defaultSupplierId` | `UUID`, optional | `null` | Optional UUID string or `null`. If non-null, validated UUID format and must exist in `suppliers/{id}`. |

---

### 3.3 `UpdatePartRequest` (`PUT /api/v1/parts/{id}` — Route 39)

| Field | Java Type & Validation | Default (if omitted) | Firebase Validation & Handling |
| :--- | :--- | :--- | :--- |
| `name` | `String`, `@NotBlank`, `@Size(max = 150)` | Required | Non-blank string, max length `150`; stored as `name.trim()`. |
| `category` | `String`, `@NotBlank`, `@Size(max = 50)` | Required | Non-blank string, max length `50`; normalized to `category.trim().toUpperCase()`. |
| `description` | `String`, optional | `null` | Optional string or `null` (overwrites existing `description`). |
| `unitOfMeasure` | `String`, `@NotBlank`, `@Size(max = 20)` | `"PCS"` | If omitted, defaults to `"PCS"`. If explicitly `null` or blank -> `400 VALIDATION_FAILED`. Max length `20`. |
| `minReorderLevel` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.0")` | Required (`@NotNull`, no fallback if missing/null? See note) | In Java `UpdatePartRequest`, field has no Java initializer (`minReorderLevel` is uninitialized `null` unless sent, failing `@NotNull` -> `400 VALIDATION_FAILED`). Require non-null scale-2 value `>= 0.00`. |
| `defaultUnitCost` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.0")` | Required (`@NotNull`) | In Java `UpdatePartRequest`, `@NotNull` rejects missing/`null` -> `400 VALIDATION_FAILED`. Require non-null scale-2 value `>= 0.00`. |
| `defaultSupplierId` | `UUID`, optional | `null` | Optional UUID string or `null`. If non-null, must exist in `suppliers/{id}` (`404` otherwise); if `null`/omitted, clears `defaultSupplierId` and `defaultSupplierName`. |

**Immutable Fields Excluded from `UpdatePartRequest`:**
`partCode`, `currentQuantity` / `initialQuantity`, `costCurrency`, and `active` are **not** present on `UpdatePartRequest` and remain unchanged during `PUT /api/v1/parts/{id}` (any extra JSON keys supplied by a client are ignored, matching Jackson's default behavior for DTO binding unless strict unknown-key rejection is configured).

---

### 3.4 `PartDto` Response Contract & `lowStock` vs `isLowStock` Finding

| JSON Property | Type | Nullable | Notes |
| :--- | :--- | :---: | :--- |
| `id` | `string` (UUID) | No | Document ID in `parts`. |
| `partCode` | `string` | No | Normalized uppercase part code. |
| `name` | `string` | No | Part display name. |
| `category` | `string` | No | Normalized uppercase category. |
| `description` | `string \| null` | Yes | Optional description. |
| `unitOfMeasure` | `string` | No | Unit of measure (e.g., `"PCS"`). |
| `currentQuantity` | `number` | No | Current stock quantity (`toJsonNumber`). |
| `minReorderLevel` | `number` | No | Reorder threshold (`toJsonNumber`). |
| `defaultUnitCost` | `number` | No | Default unit cost (`toJsonNumber`). |
| `costCurrency` | `string` | No | `"RON" \| "EUR" \| "USD"`. |
| `defaultSupplierId` | `string \| null` | Yes | Supplier UUID if linked. |
| `defaultSupplierName` | `string \| null` | Yes | Linked supplier `name` or `null`. |
| `lowStock` | `boolean` | No | Jackson wire name for `boolean isLowStock()` (`currentQuantity <= minReorderLevel`). |
| `isLowStock` | `boolean` | No | Compatibility alias carrying the exact same boolean as `lowStock` (see evidence below). |
| `active` | `boolean` | No | Part active status (PostgreSQL `is_active`, Java field `active`). |
| `createdAt` | `string` (ISO-8601 UTC) | No | Creation timestamp (`Timestamp.toDate().toISOString()`). |

Note: `Part.updatedAt` exists on the JPA entity and DB schema, **not** in `PartDto`.

#### Critical Verified Evidence: `lowStock` vs `isLowStock` JSON Property Name
In `PartDto.java`, the field is declared `private boolean isLowStock;` with getter `public boolean isLowStock()` and setter `public void setLowStock(boolean lowStock)`, without `@JsonProperty`. Standard Jackson JavaBean introspection strips the `is` prefix from primitive `boolean` `is*()` getters, serializing the JSON wire key as **`"lowStock"`**. Direct verification in `mobile/lib/features/inventory/models/part_model.dart` (line 50) confirms the Flutter client parses `isLowStock: json['lowStock'] ?? false`. However, `docs/firebase-migration/api-compatibility-matrix.md` (line 179) documented the Java field name `isLowStock`.

**Locked Stage C5 Contract:** `PartDto` in `backend-firebase` **must** emit `"lowStock"` (required by the live Java Jackson wire contract and Flutter mobile app) and **also** emit `"isLowStock"` with the identical boolean value so any consumer referencing `api-compatibility-matrix.md` also receives the expected field cleanly.

---

### 3.5 `GET /api/v1/parts` (Route 41) & `GET /api/v1/parts/low-stock` (Route 42)

- **Route 41 (`GET /api/v1/parts`):**
  - Query parameters:
    - `search` (`string`, optional): Case-insensitive substring match against `partCode`, `name`, or `description` (`LOWER(...) LIKE LOWER(%search%)`). Empty/whitespace-only behaves as `null` (unfiltered).
    - `category` (`string`, optional): Case-insensitive exact category filter (`LOWER(category) = LOWER(:category)`). Empty/whitespace-only behaves as `null`.
    - `lowStockOnly` (`boolean`, optional): When `true`, filters `active == true && currentQuantity <= minReorderLevel`. Note: `lowStockOnly=false` or omitted applies no low-stock filter (does **not** filter for non-low-stock parts).
    - `includeArchived` (`boolean`, default `false`): When `false`, filters `active == true`. When `true`, includes both active and archived parts.
    - `page` (`integer`, default `0`), `size` (`integer`, default `20`), `sort` (default `partCode,ASC`).
  - Response: `PageResponse<PartDto>` (`{ content, page, size, totalElements, totalPages, last }`).
- **Route 42 (`GET /api/v1/parts/low-stock`):**
  - No query parameters.
  - Response: `PartDto[]` (unpaged JSON array) containing all active parts (`active == true`) where `currentQuantity <= minReorderLevel`, ordered numerically by `currentQuantity ASC`.

---

### 3.6 `RecordStockMovementRequest` (`POST /api/v1/stock-movements` — Route 45)

| Field | Java Type & Validation | Default (if omitted) | Firebase Validation & Handling |
| :--- | :--- | :--- | :--- |
| `partId` | `UUID`, `@NotNull` | Required | Non-null valid UUID string (`400 VALIDATION_FAILED` if missing/invalid). |
| `quantity` | `BigDecimal`, `@NotNull`, `@DecimalMin("0.01")` | Required | Non-null finite scale-2 decimal `>= 0.01` (`DECIMAL(10,2)`). Values `<= 0` fail with `400 VALIDATION_FAILED`. |
| `movementType` | `StockMovementType`, `@NotNull` | Required | One of `STOCK_IN`, `STOCK_OUT`, `SERVICE_USAGE`, `RETURN`, `ADJUSTMENT`, `REVERSAL`. Any other value -> `400 VALIDATION_FAILED`. |
| `referenceType` | `String`, optional | `null` | Optional string (DB column `VARCHAR(50)`; validate max length `50` when provided). |
| `referenceId` | `UUID`, optional | `null` | Optional UUID string or `null` (validate UUID format when non-null). |
| `unitCost` | `BigDecimal`, optional | `null` -> fallback to `part.defaultUnitCost` | Optional scale-2 decimal (`>= 0.00`, `DECIMAL(14,2)`). Reject negative or >2 decimals with `400 VALIDATION_FAILED`. |
| `currency` | `String`, `@Pattern("^(RON|EUR|USD)$")` | `"RON"` (field initializer); if explicitly `null`, falls back to `part.costCurrency` | If key is omitted -> `"RON"`. If key is explicitly `null` -> `part.costCurrency`. If non-null string -> must match `RON \| EUR \| USD` (`400 VALIDATION_FAILED` otherwise). |
| `reason` | `String`, optional | `null` | Optional string or `null`. |

> **Verified Bean Validation Nuance on `quantity`:** In `RecordStockMovementRequest.java` (lines 17–19), `quantity` is annotated with `@DecimalMin(value = "0.01", message = "Quantity must be non-zero")`. Because `StockMovementController.recordStockMovement` runs `@Valid` before calling `StockMovementService`, HTTP callers **cannot** submit a negative `quantity` even when `movementType` is `ADJUSTMENT` or `REVERSAL`—negative numbers are rejected with `400 VALIDATION_FAILED`. Stage C5.1 must preserve `@DecimalMin("0.01")` parity.

---

### 3.7 `StockMovementDto`, `GET /api/v1/stock-movements/part/{partId}` (Route 46), and `GET /api/v1/stock-movements` (Route 47)

| JSON Property | Type | Nullable | Notes |
| :--- | :--- | :---: | :--- |
| `id` | `string` (UUID) | No | Document ID in `stock_movements`. |
| `partId` | `string` (UUID) | No | Associated part ID. |
| `partCode` | `string` | No | Part code. |
| `partName` | `string` | No | Part name. |
| `quantityDelta` | `number` | No | Signed quantity delta (`toJsonNumber`: positive or negative). |
| `movementType` | `StockMovementType` | No | Enum string. |
| `referenceType` | `string \| null` | Yes | Optional source type (e.g., `"INITIAL_SETUP"`, `"SERVICE_RECORD"`). |
| `referenceId` | `string \| null` | Yes | Optional reference UUID. |
| `unitCost` | `number` | No | Applied unit cost (`toJsonNumber`). |
| `currency` | `string` | No | `"RON" \| "EUR" \| "USD"`. |
| `reason` | `string \| null` | Yes | Optional explanation text. |
| `recordedByUserName` | `string` | No | `fullName` of the recording user. |
| `createdAt` | `string` (ISO-8601 UTC) | No | Creation timestamp (`Timestamp.toDate().toISOString()`). |

- **Route 46 (`GET /api/v1/stock-movements/part/{partId}`):**
  - Unpaged `StockMovementDto[]` sorted by `createdAt DESC`.
  - **Verified Java Behaviour:** `StockMovementRepository.findAllByPartIdOrderByCreatedAtDesc(partId)` does **not** check whether `partId` exists in `parts`; if no movements exist for `partId`, it returns `200 OK` with `[]`.
- **Route 47 (`GET /api/v1/stock-movements`):**
  - Query parameters:
    - `partId` (`UUID`, optional)
    - `type` (`StockMovementType`, optional)
    - `startDate` (`ISO.DATE_TIME` timestamp, optional): filters `createdAt >= startDate`.
    - `endDate` (`ISO.DATE_TIME` timestamp, optional): filters `createdAt <= endDate`.
    - `page` (`integer`, default `0`), `size` (`integer`, default `20`), `sort` (default `createdAt,DESC`).
  - Response: `PageResponse<StockMovementDto>`.

---

### 3.8 `CreateSupplierRequest`, `SupplierDto`, and Supplier Endpoints (Routes 48–52)

- **`CreateSupplierRequest` (`POST /api/v1/suppliers` — Route 48):**

| Field | Java Type & Validation | Default | Notes |
| :--- | :--- | :--- | :--- |
| `name` | `String`, `@NotBlank`, `@Size(max = 150)` | Required | Normalized as `name.trim()`; case-insensitively unique. |
| `contactPerson` | `String`, optional, `@Size(max = 100)` | `null` | Optional. |
| `phone` | `String`, optional, `@Size(max = 30)` | `null` | Optional. |
| `email` | `String`, optional, `@Size(max = 150)` | `null` | **Note:** Java has `@Size(max = 150)` only—there is **no** `@Email` validation annotation on `CreateSupplierRequest.email`. Match Java (do not reject valid non-standard strings unless exceeding 150 chars). |
| `taxCui` | `String`, optional, `@Size(max = 50)` | `null` | Optional. |
| `address` | `String`, optional | `null` | Optional (`TEXT` in PostgreSQL). |
| `notes` | `String`, optional | `null` | Optional (`TEXT` in PostgreSQL). |

- **`SupplierDto` Response Contract:**
  - `id` (`string`), `name` (`string`), `contactPerson` (`string | null`), `phone` (`string | null`), `email` (`string | null`), `taxCui` (`string | null`), `address` (`string | null`), `notes` (`string | null`), `active` (`boolean`), `createdAt` (`string` ISO-8601 UTC).
- **Route 49 (`GET /api/v1/suppliers`):**
  - Query params: `search` (optional substring across `name`, `contactPerson`, `phone`, `email`, `taxCui`), `includeArchived` (boolean, default `false`), `page` (default `0`), `size` (default `20`), `sort` (default `name,ASC`). Returns `PageResponse<SupplierDto>`.
- **Routes 50, 51, 52 (`GET /api/v1/suppliers/{id}`, `POST /api/v1/suppliers/{id}/archive`, `POST /api/v1/suppliers/{id}/unarchive`):**
  - Return `SupplierDto` (`200 OK`), or `404 NOT_FOUND` if supplier does not exist.

---

### 3.9 Cross-Module Inventory Contracts (Servicing Route 53 & Reports Routes 58, 60)

1. **`POST /api/v1/services` (`ServicingService.logService` — Route 53):**
   - Accepts `LogServiceRequest.partsUsed?: LogServicePartItem[]`:
     - `partId`: `UUID` (`@NotNull`)
     - `quantity`: `BigDecimal` (`@NotNull`, `@DecimalMin("0.01")`)
     - `unitCost`: optional `BigDecimal` (fallback `part.defaultUnitCost`)
     - `currency`: optional `String` (fallback `part.costCurrency`)
   - Emits `ServiceRecordDto.partsUsed: ServicePartUsageDto[]` (`id`, `partId`, `partCode`, `partName`, `quantity`, `unitCost`, `currency`) and writes corresponding `SERVICE_USAGE` entries to `stock_movements`.
2. **`GET /api/v1/reports/dashboard` (`ReportService.getDashboardKpis` — Route 58):**
   - `DashboardKpiDto.lowStockPartsCount`: integer count of active parts (`isActive == true`) where `isLowStock == true` (`currentQuantity <= minReorderLevel`).
3. **`GET /api/v1/reports/date-range` (`ReportService.getDateRangeReport` — Route 60):**
   - Filters `stock_movements` where `createdAt` falls in `[fromDate 00:00:00Z, toDate 23:59:59.999999999Z]` (Java converts `createdAt` at `ZoneOffset.UTC` to `LocalDate`):
     - `STOCK_IN` and `RETURN`: adds `quantityDelta` to `stockInQuantity["TOTAL"]` and `quantityDelta * unitCost` to `stockInCost[currency]`.
     - `STOCK_OUT` and `SERVICE_USAGE`: adds `abs(quantityDelta)` to `stockOutQuantity["TOTAL"]` and `abs(quantityDelta) * unitCost` to `stockOutCost[currency]`.
     - `ADJUSTMENT` and `REVERSAL`: ignored by date-range summary aggregation.

---

## 4. Verified Java Business Rules

Every rule below was directly observed in the Java source files listed in §2:

### 4.1 Parts Business Rules (`PartService.java` & `Part.java`)

1. **Part Code Normalization & Uniqueness (`PartService.createPart`, lines 49–55; `Part` constructor, lines 56–59):**
   - Input `partCode` is normalized with `partCode.toUpperCase().trim()` before uniqueness checking and persistence.
   - `partRepository.existsByPartCodeIgnoreCase(code)` checks across **all** parts (active and archived). Collision throws `ConflictException("Part with code '" + code + "' already exists")` -> HTTP `409 CONFLICT` (`errorCode: "CONFLICT"`).
2. **Currency Validation (`PartService.createPart`, lines 57–59):**
   - `costCurrency` must be a valid `SupportedCurrency` (`RON`, `EUR`, `USD`), else throws `BusinessException` -> HTTP `400 BAD_REQUEST`.
3. **Supplier Resolution (`PartService.createPart`, lines 61–67; `updatePart`, lines 111–119):**
   - When `defaultSupplierId` is non-null, `supplierRepository.findById(id)` is called; missing supplier throws `ResourceNotFoundException("Supplier", id)` -> HTTP `404 NOT_FOUND`.
   - **Verified Nuance:** Java does **not** reject an archived supplier (`!supplier.isActive()`) when associating `defaultSupplierId` on create or update. Firebase must match this behaviour.
   - On `updatePart`, when `defaultSupplierId == null`, `defaultSupplier` is cleared to `null`.
4. **Field Normalization (`Part.java`, lines 56–70; `PartService.updatePart`, lines 121–127):**
   - On create: `name.trim()`, `category.toUpperCase().trim()`, `unitOfMeasure` defaults to `"PCS"` and normalizes `.toUpperCase().trim()`, `currentQuantity` initialized to `initialQuantity ?? 0`, `minReorderLevel` defaults to `2.0`, `defaultUnitCost` defaults to `0`, `costCurrency` defaults to `"RON"`, `active = true`.
   - On update: updates `name.trim()`, `category.toUpperCase().trim()`, `description`, `unitOfMeasure`, `minReorderLevel`, `defaultUnitCost`, `defaultSupplier`.
   - **Verified Java Nuance:** `PartService.updatePart` updates `unitOfMeasure` directly (`request.getUnitOfMeasure()`) without `.toUpperCase()`, whereas `Part` constructor calls `.toUpperCase().trim()`. In Firebase, trim `unitOfMeasure` on update (or normalize consistently if desired, noting this minor Java asymmetry). Updating an archived part is allowed in Java (`updatePart` does not check `part.isActive()`).
5. **Conditional Initial Stock Movement (`PartService.createPart`, lines 81–103):**
   - **Zero initial quantity (`initialQuantity == 0`):** Only the `parts` document is saved; **zero** `stock_movements` records are created.
   - **Positive initial quantity (`initialQuantity > 0`):** Atomically creates an initial `StockMovement` with:
     - `movementType = STOCK_IN`
     - `quantityDelta = initialQuantity` (positive)
     - `referenceType = "INITIAL_SETUP"`
     - `referenceId = null`
     - `unitCost = defaultUnitCost`
     - `currency = costCurrency`
     - `reason = "Initial stock on part creation"`
   - **Audit-User Resolution Compatibility Deviation:** Java `PartService.createPart` (lines 83–85) fell back to `userRepository.findAll().stream().findFirst().orElse(null)` when `userId` was missing and silently skipped creating the movement if null, while `StockMovementService.recordStockMovement` (lines 69–70) threw `BusinessException("User not found")` (`400`). Consistent with Stage C4 §2.1, `backend-firebase` omits any `findAll().findFirst()` fallback, reads `app_users/{authenticatedUser.id}` inside the transaction, and rejects missing/inactive `app_users` records with `401 UNAUTHORIZED`.
6. **Archive / Unarchive (`PartService.archivePart` & `unarchivePart`, lines 152–166):**
   - Loads `Part` by ID (`404 NOT_FOUND` if missing) and sets `active = false` / `active = true` (idempotent if already in target state).
   - Preserves the `partCode` uniqueness lock so an archived part code cannot be reused.
7. **Low-Stock Calculation & Queries (`PartDto.fromEntity`, line 44; `PartRepository`, lines 23–49):**
   - Threshold comparison is inclusive: `currentQuantity <= minReorderLevel` (`compareTo <= 0`).
   - `PartDto.isLowStock()` reflects `currentQuantity <= minReorderLevel` regardless of `active`.
   - `GET /api/v1/parts/low-stock` (`findLowStockParts`) and `GET /api/v1/parts?lowStockOnly=true` require **both** `active == true` and `currentQuantity <= minReorderLevel`.

### 4.2 Stock Movement Business Rules (`StockMovementService.java`)

1. **Part Lookup & Active Guard (`recordStockMovement`, lines 42–48):**
   - Loads `Part` by `partId` (`404 NOT_FOUND` if missing).
   - If `!part.isActive()`, throws `BusinessException("Cannot record stock movement for archived part: " + part.getPartCode())` -> HTTP `400 BAD_REQUEST`.
2. **Quantity Delta Calculation (`recordStockMovement`, lines 50–54):**
   - `STOCK_IN`, `RETURN`: `delta = +abs(quantity)` (strictly positive addition).
   - `STOCK_OUT`, `SERVICE_USAGE`: `delta = -abs(quantity)` (strictly negative deduction).
   - `ADJUSTMENT`, `REVERSAL`: `delta = quantity` (signed in service code, constrained to `>= 0.01` at the HTTP controller boundary by `@DecimalMin("0.01")`).
3. **Non-Negative Stock Invariant (`recordStockMovement`, lines 56–64 & PostgreSQL `CHECK (current_quantity >= 0)`):**
   - Computes `newQuantity = part.currentQuantity + delta`.
   - If `newQuantity < 0`, throws `BusinessException("Insufficient stock for part '<partCode>'. Current: <current>, Requested delta: <delta>")` -> HTTP `400 BAD_REQUEST`, leaving `parts/{partId}` unchanged and creating no ledger document.
4. **Unit Cost & Currency Fallbacks (`recordStockMovement`, lines 75–76):**
   - `unitCost = request.unitCost ?? part.defaultUnitCost`
   - `currency = request.currency ?? part.costCurrency` (triggered when `currency` is omitted or `null`; note DTO initializer sets `"RON"` when key is omitted in JSON, and `null` explicitly sent triggers `part.costCurrency` fallback).
5. **Immutable Atomic Persistence (`recordStockMovement`, lines 66–91):**
   - Updates `part.currentQuantity = newQuantity` and inserts an immutable `StockMovement` document inside the same transaction.

### 4.3 Supplier Business Rules (`SupplierService.java`)

1. **Name Uniqueness (`createSupplier`, lines 31–48):**
   - Trims `request.name`.
   - Checks `supplierRepository.existsByNameIgnoreCase(name.trim())` across active and archived suppliers. Collision throws `ConflictException("Supplier with name '" + request.getName() + "' already exists")` -> HTTP `409 CONFLICT`.
   - Initializes `active = true`.
2. **Archive / Unarchive & Lookup (`getSupplierById`, `archiveSupplier`, `unarchiveSupplier`, lines 58–73):**
   - `404 NOT_FOUND` if supplier does not exist; idempotent `active = false` / `true`. Archived supplier names remain locked in `unique_keys`.
3. **List & Substring Search (`SupplierRepository.searchSuppliers`):**
   - Filters `active = true` when `includeArchived = false`.
   - When `search` is non-empty, performs case-insensitive substring match against `name`, `contactPerson`, `phone`, `email`, or `taxCui`.

### 4.4 Servicing Spare-Part Integration Rules (`ServicingService.logService`, lines 82–157)

1. **`logService` Deducts Inventory Across All Statuses:**
   - Whether `request.status` is `PLANNED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`, `ServicingService.logService` validates and deducts every entry in `request.partsUsed`, persists `ServicePartUsage`, and writes a `StockMovement` with `movementType = SERVICE_USAGE`, `quantityDelta = -item.quantity.abs()`, `referenceType = "SERVICE_RECORD"`, `referenceId = savedRecord.id`, `unitCost = item.unitCost ?? part.defaultUnitCost`, `currency = item.currency ?? part.costCurrency`, and `reason = "Used in service on motorbike " + bike.registrationNumber`.
   - `updateServiceStatus` does **not** alter stock or stock movements.
2. **Duplicate `partId` Pre-Validation Aggregation Requirement:**
   - In Java `ServicingService.logService` (lines 85–99), the validation loop checks each `LogServicePartItem` against initial `part.getCurrentQuantity()` individually without summing duplicate `partId` items first (only PostgreSQL's `CHECK (current_quantity >= 0)` stops negative cumulative deductions during flush, which would surface as an unhandled 500 constraint violation).
   - Because Firestore has no database `CHECK` constraint and requires all reads before writes, Firebase `logService` **must aggregate `totalRequestedMinor` per distinct `partId`** during the read/validation phase and verify `part.currentQuantityMinor >= totalRequestedMinor` before executing writes, returning a clean `400 BAD_REQUEST` on insufficient cumulative stock.

---

## 5. Firestore Data Model

All collections follow `backend-firebase` domain conventions (`UUID v4` document IDs, `Timestamp` fields for timestamps, canonical scale-2 decimal strings for quantities and monetary amounts).

### 5.1 Collection: `parts/{partId}` (`PartDocument`)

| Field | Firestore Type | Constraints / Derivation |
| :--- | :--- | :--- |
| `id` | `string` (UUID v4) | Equals document ID `{partId}`. |
| `partCode` | `string` | Normalized `trim().toUpperCase()`, immutable after create. |
| `name` | `string` | `trim()`. |
| `category` | `string` | Normalized `trim().toUpperCase()`. |
| `description` | `string \| null` | Nullable description. |
| `unitOfMeasure` | `string` | Default `"PCS"`, normalized `trim().toUpperCase()`. |
| `currentQuantity` | `DecimalString` | Canonical scale-2 string (e.g., `"15.00"`), `>= "0.00"`. Authoritative value. |
| `currentQuantityMinor` | `number` | Derived integer minor units `Number(toMinorUnits(currentQuantity))`. Used for numeric Firestore sorting in `low-stock` and `sort=currentQuantity`. |
| `minReorderLevel` | `DecimalString` | Canonical scale-2 string (default `"2.00"`). |
| `defaultUnitCost` | `DecimalString` | Canonical scale-2 string (default `"0.00"`). |
| `costCurrency` | `"RON" \| "EUR" \| "USD"` | Default `"RON"`, immutable after create. |
| `defaultSupplierId` | `string \| null` | References `suppliers/{supplierId}` or `null`. |
| `defaultSupplierName` | `string \| null` | Denormalized from `suppliers/{defaultSupplierId}.name` or `null`. |
| `isLowStock` | `boolean` | Derived: `toMinorUnits(currentQuantity) <= toMinorUnits(minReorderLevel)`. Maintained atomically on create, update, stock movement, and servicing deduction. |
| `isActive` | `boolean` | Initialized to `true`. Serialized as `active` in `PartDto`. |
| `createdAt` | `Timestamp` | Server-side transaction `Timestamp.now()`. |
| `updatedAt` | `Timestamp` | Updated on every write (`Timestamp.now()`). |

### 5.2 Collection: `stock_movements/{movementId}` (`StockMovementDocument`)

Strictly append-only collection; documents are never updated or deleted after creation.

| Field | Firestore Type | Constraints / Derivation |
| :--- | :--- | :--- |
| `id` | `string` (UUID v4) | Equals document ID `{movementId}`. |
| `partId` | `string` (UUID v4) | References `parts/{partId}`. |
| `partCode` | `string` | Denormalized from `parts/{partId}.partCode` at write time (immutable). |
| `partName` | `string` | Denormalized snapshot from `parts/{partId}.name` at write time. |
| `quantityDelta` | `DecimalString` | Signed canonical scale-2 string (e.g., `"10.00"`, `"-3.50"`). |
| `movementType` | `StockMovementType` | `"STOCK_IN" \| "STOCK_OUT" \| "SERVICE_USAGE" \| "RETURN" \| "ADJUSTMENT" \| "REVERSAL"`. |
| `referenceType` | `string \| null` | Optional reference type (e.g., `"INITIAL_SETUP"`, `"SERVICE_RECORD"`). |
| `referenceId` | `string \| null` | Optional reference UUID. |
| `unitCost` | `DecimalString` | Canonical scale-2 string (`part.defaultUnitCost` if omitted). |
| `currency` | `"RON" \| "EUR" \| "USD"` | `"RON"` default if omitted in request; `part.costCurrency` if explicit `null`. |
| `reason` | `string \| null` | Optional text reason. |
| `recordedByUserId` | `string` (UUID v4) | Authenticated user ID from `app_users/{id}`. |
| `recordedByUserName` | `string` | Denormalized from `app_users/{recordedByUserId}.fullName`. |
| `createdAt` | `Timestamp` | Server-side transaction `Timestamp.now()`. |

### 5.3 Collection: `suppliers/{supplierId}` (`SupplierDocument`)

| Field | Firestore Type | Constraints / Derivation |
| :--- | :--- | :--- |
| `id` | `string` (UUID v4) | Equals document ID `{supplierId}`. |
| `name` | `string` | Trimmed display name. |
| `nameNormalized` | `string` | Derived `name.trim().toLowerCase()`. Supports case-insensitive uniqueness/ordering parity. |
| `contactPerson` | `string \| null` | Optional contact person (`max 100`). |
| `phone` | `string \| null` | Optional phone (`max 30`). |
| `email` | `string \| null` | Optional email (`max 150`). |
| `taxCui` | `string \| null` | Optional tax CUI (`max 50`). |
| `address` | `string \| null` | Optional address. |
| `notes` | `string \| null` | Optional notes. |
| `isActive` | `boolean` | Initialized to `true`. Serialized as `active` in `SupplierDto`. |
| `createdAt` | `Timestamp` | Server-side transaction `Timestamp.now()`. |
| `updatedAt` | `Timestamp` | Updated on archive/unarchive (`Timestamp.now()`). |

### 5.4 Collection: `unique_keys/{lockId}` (`UniqueKeyDocument`)

Reuses the existing Stage B / Stage C2 atomic uniqueness pattern:

- **Part Code Lock ID:** `part_code_${sha256(partCode.trim().toUpperCase())}`
- **Supplier Name Lock ID:** `supplier_name_${sha256(name.trim().toLowerCase())}`
- Document shape: `{ id: lockId, fieldType: "part_code" | "supplier_name", normalizedValue: string, entityId: string, createdAt: Timestamp }`.

### 5.5 Denormalization Lifecycle & Consistency Analysis

- **`parts.defaultSupplierName`:** Because Java exposes no `PUT /api/v1/suppliers/{id}` update endpoint, `suppliers/{id}.name` never mutates after creation. `parts.defaultSupplierName` can therefore never go stale from supplier edits and only changes when `PUT /api/v1/parts/{id}` changes or clears `defaultSupplierId`.
- **`stock_movements.partCode` & `partName`:** `partCode` is immutable (`UpdatePartRequest` excludes `partCode`). If a part's `name` is updated via `PUT /api/v1/parts/{id}`, historical `stock_movements` documents preserve the snapshot `partName` recorded when the movement occurred (whereas Java JPA joins `part.name` live). This minor denormalization difference is documented in §7; we deliberately do **not** fan-out rewrite append-only historical stock ledger documents when a part is renamed.

---

## 6. Transaction and Concurrency Design

### 6.1 Core Transaction Rules

1. **Read-Before-Write Strictness:** Every Firestore `db.runTransaction(async (tx) => ...)` must finish **all** `tx.get(...)` calls before issuing any `tx.set(...)` or `tx.update(...)`.
2. **Deterministic Per-Attempt Timestamp:** Create a single `const now = Timestamp.now()` at the top of each transaction callback attempt (never use `FieldValue.serverTimestamp()` or `FieldValue.increment()`).
3. **`BigInt` Fixed-Point Math:** All quantity and cost checks and arithmetic use `toMinorUnits()`, `fromMinorUnits()`, `addMinorUnits()`, and `subMinorUnits()` with `scale = 2`.
4. **Auth User Verification:** Every write transaction that records an audit user (`recordedByUserName`) reads `app_users/{authenticatedUser.id}` inside the transaction and throws `401 UNAUTHORIZED` if missing or `!isActive`.

### 6.2 Transaction Workflows

#### Workflow A: `POST /api/v1/parts` (`createPart`)
- **Pre-transaction:** Validate request DTO fields, currency (`RON | EUR | USD`), scale-2 non-negative decimals (`initialQuantity`, `minReorderLevel`, `defaultUnitCost`), optional UUID format for `defaultSupplierId`, normalize `code = partCode.trim().toUpperCase()`, compute `lockId = "part_code_" + sha256(code)`.
- **Read phase (parallel `Promise.all`):**
  1. `tx.get(unique_keys/{lockId})`
  2. `tx.get(app_users/{authenticatedUser.id})` (mandatory audit/auth read, even if `initialQuantity == 0`, for consistent auth enforcement)
  3. If `defaultSupplierId !== null`: `tx.get(suppliers/{defaultSupplierId})`
- **Validation phase:**
  - If user doc missing or `!user.isActive` -> `401 UNAUTHORIZED`.
  - If lock doc exists -> `409 CONFLICT` (`Part with code '${code}' already exists`).
  - If `defaultSupplierId !== null` and supplier doc missing -> `404 NOT_FOUND` (`Supplier not found: ${defaultSupplierId}`).
- **Write phase:**
  1. `tx.set(unique_keys/{lockId}, ...)`
  2. `tx.set(parts/{partId}, partDoc)` with `isLowStock = initialMinor <= reorderMinor`, `currentQuantityMinor = Number(initialMinor)`, `isActive = true`.
  3. If `initialMinor > 0n`: `tx.set(stock_movements/{movementId}, initialMovementDoc)` (`STOCK_IN`, `quantityDelta = fromMinorUnits(initialMinor)`, `referenceType = "INITIAL_SETUP"`, `referenceId = null`, `unitCost = partDoc.defaultUnitCost`, `currency = partDoc.costCurrency`, `reason = "Initial stock on part creation"`, `recordedByUserId = user.id`, `recordedByUserName = user.fullName`).
- **Budget:** Max 3 reads, max 3 writes.

#### Workflow B: `PUT /api/v1/parts/{id}` (`updatePart`)
- **Pre-transaction:** Validate request DTO (`name`, `category`, `unitOfMeasure`, `minReorderLevel`, `defaultUnitCost`, optional `defaultSupplierId`).
- **Read phase (parallel):**
  1. `tx.get(parts/{id})`
  2. If `defaultSupplierId !== null`: `tx.get(suppliers/{defaultSupplierId})`
- **Validation phase:**
  - If part doc missing -> `404 NOT_FOUND`.
  - If `defaultSupplierId !== null` and supplier missing -> `404 NOT_FOUND`.
- **Write phase:**
  - Update `name`, `category`, `description`, `unitOfMeasure`, `minReorderLevel`, `defaultUnitCost`, `defaultSupplierId`, `defaultSupplierName`, `isLowStock = toMinorUnits(part.currentQuantity) <= toMinorUnits(newMinReorderLevel)`, `updatedAt = now`.
- **Budget:** Max 2 reads, 1 write.

#### Workflow C: `POST /api/v1/parts/{id}/archive` & `/unarchive`
- **Read phase:** `tx.get(parts/{id})` (`404 NOT_FOUND` if missing).
- **Write phase:** `tx.update(parts/{id}, { isActive: false | true, updatedAt: now })`.
- **Budget:** 1 read, 1 write.

#### Workflow D: `POST /api/v1/stock-movements` (`recordStockMovement`)
- **Pre-transaction:** Validate `partId` (UUID), `quantity` (scale-2 decimal `>= 0.01`), `movementType` (`StockMovementType`), optional `unitCost` (scale-2 decimal `>= 0.00`), optional `currency` (`RON | EUR | USD` or `"RON"` when omitted or `null` fallback marker), optional `referenceType` (`max 50`), optional `referenceId` (UUID).
- **Read phase (parallel):**
  1. `tx.get(parts/{partId})`
  2. `tx.get(app_users/{authenticatedUser.id})`
- **Validation phase:**
  - If user missing or `!user.isActive` -> `401 UNAUTHORIZED`.
  - If part missing -> `404 NOT_FOUND`.
  - If `!part.isActive` -> `400 BAD_REQUEST` (`Cannot record stock movement for archived part: ${part.partCode}`).
  - Compute `deltaMinor`:
    - `STOCK_IN`, `RETURN` -> `+abs(quantityMinor)`
    - `STOCK_OUT`, `SERVICE_USAGE` -> `-abs(quantityMinor)`
    - `ADJUSTMENT`, `REVERSAL` -> `quantityMinor`
  - Compute `newQuantityMinor = toMinorUnits(part.currentQuantity) + deltaMinor`.
  - If `newQuantityMinor < 0n` -> `400 BAD_REQUEST` (`Insufficient stock for part '${part.partCode}'. Current: ${part.currentQuantity}, Requested delta: ${fromMinorUnits(deltaMinor)}`).
  - Verify result fits PostgreSQL `DECIMAL(10,2)` upper bound (`<= 99_999_999.99`) -> `400 BAD_REQUEST` / `422` if overflow.
- **Write phase:**
  1. `tx.update(parts/{partId}, { currentQuantity: fromMinorUnits(newQuantityMinor), currentQuantityMinor: Number(newQuantityMinor), isLowStock: newQuantityMinor <= toMinorUnits(part.minReorderLevel), updatedAt: now })`
  2. `tx.set(stock_movements/{movementId}, movementDoc)`
- **Budget:** 2 reads, 2 writes. Concurrency safety: Firestore optimistic concurrency retries serialized conflicting `STOCK_OUT` requests on the same `parts/{partId}` document; the second request re-reads the reduced `currentQuantity` and fails cleanly with `400 BAD_REQUEST` if stock becomes insufficient, making negative stock impossible.

#### Workflow E: `POST /api/v1/suppliers` (`createSupplier`) & Archive/Unarchive
- **`createSupplier`:** Read `unique_keys/supplier_name_${sha256(name.trim().toLowerCase())}` -> if exists, `409 CONFLICT` (`Supplier with name '${name.trim()}' already exists`) -> write `unique_keys/{lockId}` and `suppliers/{supplierId}` (`isActive: true`). Budget: 1 read, 2 writes.
- **`archiveSupplier` / `unarchiveSupplier`:** Read `suppliers/{id}` (`404 NOT_FOUND` if missing) -> update `isActive: false | true`, `updatedAt: now`. Budget: 1 read, 1 write.

#### Workflow F: Cross-Module Servicing Stock Deduction (`POST /api/v1/services` — `logService`)
When `partsUsed` is non-empty during Stage C6 servicing implementation:
1. **Pre-transaction Safeguard:** Reject `partsUsed.length > MAX_SERVICE_PARTS_ITEMS` (`50`) or unique `partId` count `> MAX_UNIQUE_SERVICE_PARTS` (`50`) with `422 UNPROCESSABLE_ENTITY` (Stage C4 pattern) before touching Firestore.
2. **Duplicate `partId` Aggregation:** Group `partsUsed` by `partId` into `requestedTotalMinorByPartId: Map<string, bigint>`.
3. **Read phase (parallel, all before any write):** Read `app_users/{authenticatedUser.id}`, `motorbikes/{motorbikeId}`, optional `maintenance_schedules/{scheduleId}`, and every distinct `parts/{partId}` document.
4. **Validation phase:** Verify user (`401`), bike (`404`/`400`), optional schedule (`404`), and for every distinct `partId`: part exists (`404`), `part.isActive == true` (`400`), and `toMinorUnits(part.currentQuantity) >= requestedTotalMinorByPartId.get(partId)` (`400`).
5. **Write phase:** Update `motorbikes/{motorbikeId}`, optional `maintenance_schedules/{scheduleId}`, create `service_records/{serviceId}`, update each distinct `parts/{partId}` **once** with `newQuantity = currentQuantity - requestedTotalMinor` and recomputed `isLowStock` / `currentQuantityMinor`, and create one immutable `stock_movements/{movementId}` (`SERVICE_USAGE`) per `LogServicePartItem`.

### 6.3 Transaction Budget & Read-Volume Safeguards

Because Firestore enforces a hard 500-document write limit and 10 MiB transaction payload limit—and does not support native multi-column `LIKE '%...%'` substring queries—Stage C5 establishes explicit, measurable bounds (returning HTTP `422 UNPROCESSABLE_ENTITY` with zero partial writes when exceeded):

| Safeguard Constant | Value | Applies To | Rationale |
| :--- | :--- | :--- | :--- |
| `MAX_SERVICE_PARTS_ITEMS` | `50` | `POST /api/v1/services` `partsUsed` array | Caps total writes at `3 + 50 (parts) + 50 (movements) = 103`, safely within Firestore's `500` write limit. |
| `MAX_UNIQUE_SERVICE_PARTS` | `50` | Distinct `partId` reads in `logService` | Bounds transaction read lock set. |
| `MAX_TRANSACTION_WRITES` | `500` | Any inventory/servicing transaction | Runtime pre-commit check against Firestore hard transaction write cap. |
| `MAX_COMMIT_PAYLOAD_BYTES` | `10_485_760` (10 MiB) | Any inventory/servicing transaction | Runtime pre-commit payload size check. |
| `MAX_SEARCH_SCAN_DOCS` | `1000` | `GET /api/v1/parts?search=...` & `GET /api/v1/suppliers?search=...` | When substring `search` is provided, query uses all applicable equality filters (`isActive`, `category`, `isLowStock`) and fetches at most `1001` docs (`limit(1001)`); if `> 1000`, rejects with `422` rather than scanning an unbounded collection or silently truncating search results. When `search` is omitted, pure Firestore cursor/`count()` pagination handles arbitrary collection sizes without scan limits. |

---

## 7. API Compatibility Requirements and Documented Deviations

| # | Area | Java Spring Boot Behaviour | Stage C5 Firebase Requirement / Deviation | Impact |
| :-: | :--- | :--- | :--- | :--- |
| **1** | `PartDto` boolean key (`lowStock` vs `isLowStock`) | Java field is `isLowStock`, getter is `isLowStock()`. Jackson strips `is` and emits JSON `"lowStock"`. Flutter `part_model.dart` reads `json['lowStock']`. Stage A matrix table listed `isLowStock`. | **Emit both `"lowStock"` and `"isLowStock"`** with identical boolean values in `PartDto` responses. | Zero breaking changes for Flutter or matrix callers. |
| **2** | Decimal input JSON format | Jackson accepts both JSON numbers (`15.5`) and numeric strings (`"15.50"`), subject to `@DecimalMin` and PostgreSQL `scale = 2`. | Apply Stage C4 Rule N / Rule S parser: accept both finite JSON numbers and canonical numeric strings, reject `scale > 2`, reject non-finite or below-min values (`400 VALIDATION_FAILED`). | 100% compatible with web, mobile, and tests. |
| **3** | Negative `ADJUSTMENT` / `REVERSAL` via `POST /api/v1/stock-movements` | `RecordStockMovementRequest.quantity` has `@DecimalMin("0.01")`, rejecting `<= 0` at controller validation with `400` even though `StockMovementService` has an `ADJUSTMENT`/`REVERSAL` pass-through branch. | Preserve `@DecimalMin("0.01")` on HTTP `quantity` (`400 VALIDATION_FAILED` for `<= 0`); use `STOCK_OUT` to reduce inventory via API. | Exact Java API parity (documented in §11). |
| **4** | Mobile UI `StockMovementType` mismatch (`inventory_screen.dart` lines 37, 68–78) | Mobile Flutter app submits `'PURCHASE'` and `'USAGE_NON_SERVICE'`, which are invalid `StockMovementType` enum constants in Java (`STOCK_IN`, `STOCK_OUT`, `SERVICE_USAGE`, `RETURN`, `ADJUSTMENT`, `REVERSAL`). | **Intentional Preservation:** `backend-firebase` enforces the authoritative Java enum (`400 VALIDATION_FAILED` on `'PURCHASE'`/`'USAGE_NON_SERVICE'`). Do **not** modify `mobile/` in Stage C5 and do not invent undocumented enum aliases. | Documented client bug flagged in §11. |
| **5** | Missing `app_users/{id}` in transaction audit | `PartService.createPart` had a dev fallback (`findAll().findFirst()`) when user missing; `StockMovementService` threw `400 BusinessException`. | Read `app_users/{authenticatedUser.id}` in write transactions (`createPart`, `recordStockMovement`, `logService`); return `401 UNAUTHORIZED` if missing or inactive (consistent with Stage C4 §2.1). | Tighter auth integrity; intentional documented deviation. |
| **6** | Historical `partName` on `StockMovementDto` | JPA dynamically joins `part.name` via FK on read. | `stock_movements` stores denormalized snapshot `partCode` (`immutable`) and `partName` at movement creation time; rename via `PUT /api/v1/parts/{id}` does not retroactively rewrite immutable ledger records. | Preserves append-only ledger invariant. |
| **7** | Duplicate `partId` in `LogServiceRequest.partsUsed` | Pre-check loop checked each line individually before deduction loop. | Aggregate requested quantity by distinct `partId` before validating stock in Firestore transaction (`400 BAD_REQUEST` on cumulative shortfall). | Prevents overdraft & negative-stock corruption. |
| **8** | Substring `search` (`parts` / `suppliers`) | SQL `LOWER(col) LIKE LOWER('%search%')` across multiple text columns. | When `search` is absent -> native Firestore indexed query + `count()` + cursor pagination. When `search` is present -> indexed equality pre-filter + bounded `MAX_SEARCH_SCAN_DOCS = 1000` in-memory `includes(search.toLowerCase())` filter (`422` if > 1000 candidate docs). | Avoids silent truncation & unbounded scans; see §11 scalability gate. |
| **9** | Authentication middleware | `SecurityConfig` requires `.anyRequest().authenticated()` with zero role restrictions on `/api/v1/parts/**`, `/api/v1/stock-movements/**`, `/api/v1/suppliers/**`. | Attach `createAuthMiddleware` only; **do NOT attach `ownerMiddleware`**. Authenticated `ROLE_CUSTOMER` tokens must reach handlers (not 403). | Exact Java authorization parity (Stage C4 pattern). |

---

## 8. Required Firestore Indexes

### 8.1 Automatic Single-Field vs Composite Indexes

Firestore automatically maintains single-field ascending and descending indexes for every non-array field. Queries with **zero equality filters** and **one `orderBy`** (e.g., `parts` with `includeArchived=true` ordered by `partCode ASC/DESC`, `suppliers` with `includeArchived=true` ordered by `name ASC/DESC`, or `stock_movements` ordered by `createdAt DESC` with no `partId`/`movementType` filter) use automatic single-field indexes and **must not** be added as single-field entries in `firestore.indexes.json`.

Additionally, `fieldOverrides` in `backend-firebase/firestore.indexes.json` must remain `[]`.

### 8.2 Composite Indexes Required for Stage C5 Query Parity

| Collection | Index Fields | Status in `firestore.indexes.json` | Queries Served |
| :--- | :--- | :--- | :--- |
| `parts` | `isActive ASC`, `partCode ASC` | **New (Add in C5.1)** | `GET /api/v1/parts` default (`includeArchived=false`, `sort=partCode,ASC`) and bounded `search` scan. |
| `parts` | `isActive ASC`, `partCode DESC` | **New (Add in C5.1)** | `GET /api/v1/parts` (`includeArchived=false`, `sort=partCode,DESC`). |
| `parts` | `isActive ASC`, `category ASC`, `partCode ASC` | **Already Present** | `GET /api/v1/parts?category=...&includeArchived=false` (`sort=partCode,ASC`). |
| `parts` | `isActive ASC`, `category ASC`, `partCode DESC` | **New (Add in C5.1)** | `GET /api/v1/parts?category=...&includeArchived=false` (`sort=partCode,DESC`). |
| `parts` | `category ASC`, `partCode ASC` | **New (Add in C5.1)** | `GET /api/v1/parts?category=...&includeArchived=true` (`sort=partCode,ASC`). |
| `parts` | `isActive ASC`, `isLowStock ASC`, `partCode ASC` | **New (Add in C5.1)** | `GET /api/v1/parts?lowStockOnly=true` (`sort=partCode,ASC`). |
| `parts` | `isActive ASC`, `isLowStock ASC`, `currentQuantityMinor ASC` | **New (Add in C5.1)** | `GET /api/v1/parts/low-stock` (Route 42 numeric `currentQuantity ASC` sort) & Route 58 KPI count (`where isActive == true, isLowStock == true`). |
| `parts` | `isActive ASC`, `isLowStock ASC`, `currentQuantity ASC` | *Already Present (Legacy)* | Retain until verified whether any Stage C3/report code uses `currentQuantity`; Route 42 must use `currentQuantityMinor ASC` for numeric ordering. |
| `stock_movements` | `partId ASC`, `createdAt DESC` | **Already Present** | Route 46 (`GET /part/{partId}`) and Route 47 (`?partId=...` with optional date range, `createdAt DESC`). |
| `stock_movements` | `partId ASC`, `createdAt ASC` | **New (Add in C5.1)** | Route 47 (`?partId=...` with `sort=createdAt,ASC`). |
| `stock_movements` | `movementType ASC`, `createdAt DESC` | **New (Add in C5.1)** | Route 47 (`?type=...` with optional date range, `createdAt DESC`). |
| `stock_movements` | `movementType ASC`, `createdAt ASC` | **New (Add in C5.1)** | Route 47 (`?type=...` with `sort=createdAt,ASC`). |
| `stock_movements` | `partId ASC`, `movementType ASC`, `createdAt DESC` | **Already Present** | Route 47 (`?partId=...&type=...` with optional date range, `createdAt DESC`). |
| `stock_movements` | `partId ASC`, `movementType ASC`, `createdAt ASC` | **New (Add in C5.1)** | Route 47 (`?partId=...&type=...` with `sort=createdAt,ASC`). |
| `suppliers` | `isActive ASC`, `name ASC` | **New (Add in C5.1)** | `GET /api/v1/suppliers` default (`includeArchived=false`, `sort=name,ASC`) and bounded `search` scan. |
| `suppliers` | `isActive ASC`, `name DESC` | **New (Add in C5.1)** | `GET /api/v1/suppliers` (`includeArchived=false`, `sort=name,DESC`). |

> **Dynamic Custom `sort` Fallback:** If a caller requests an arbitrary `sort` field on `/api/v1/parts` or `/api/v1/suppliers` (e.g., `sort=name,ASC` or `sort=currentQuantity,DESC` on parts) that does not have a dedicated Firestore composite index for every equality combination, apply bounded scan (`<= MAX_SEARCH_SCAN_DOCS`) + deterministic Java-matching in-memory comparator sorting, or add composite indexes for any high-volume sort property needed in production. Never allow Firestore to fail with `FAILED_PRECONDITION` due to an unindexed dynamic `sort` parameter.

---

## 9. Emulator Testing Plan

Stage C5.1 must pass all unit and Firestore Emulator integration tests across **3 consecutive clean emulator runs** with zero failures or skipped assertions.

### 9.1 Unit Tests (`inventory.validation.spec.ts` / `money.spec.ts`)

- Scale-2 decimal validation for quantities and costs:
  - Accepts JSON number (`15.5`) and JSON numeric string (`"15.50"`).
  - Rejects `> 2` fractional digits (`15.125`, `"15.125"` -> `400`).
  - Rejects negative values (`-1`, `"-0.01"` -> `400`).
  - Rejects `quantity = 0` or `0.00` on `RecordStockMovementRequest` (`400`).
- Delta sign resolution across all 6 `StockMovementType` constants.
- Low-stock boundary evaluation (`currentQuantity > minReorderLevel` -> `false`, `==` -> `true`, `<` -> `true`).

### 9.2 15-Route Authentication & Role Matrix (Emulator Integration Tests)

Verify all **15 routes (Routes 38–52)** against:
- Missing `Authorization` header -> `401 UNAUTHORIZED`.
- Malformed / expired / invalid JWT -> `401 UNAUTHORIZED`.
- Authenticated token whose `app_users/{id}` is missing or inactive -> `401 UNAUTHORIZED`.
- Valid authenticated `ROLE_CUSTOMER` token -> **NOT rejected with `403`** (reaches handler; returns `2xx` on valid queries/mutations).

### 9.3 Functional & Negative Integration Tests (Firestore Emulator)

1. **Parts Lifecycle:**
   - `POST /api/v1/parts` with `initialQuantity = 0` -> `201`, creates part, zero `stock_movements` created, `lowStock` & `isLowStock` reflect `0 <= minReorderLevel`.
   - `POST /api/v1/parts` with `initialQuantity = 10` -> `201`, creates part AND atomic `INITIAL_SETUP` `STOCK_IN` movement with `recordedByUserName`.
   - Duplicate `partCode` differing only by case/whitespace (`" brk-01 "` vs `"BRK-01"`) -> `409 CONFLICT`.
   - Invalid/missing `defaultSupplierId` -> `404 NOT_FOUND`; valid `defaultSupplierId` populates `defaultSupplierName`.
   - `PUT /api/v1/parts/{id}` updates mutable fields, clears supplier when `defaultSupplierId: null`, recalculates `lowStock`/`isLowStock`, and leaves `partCode`, `currentQuantity`, and `costCurrency` untouched.
   - `POST /api/v1/parts/{id}/archive` & `/unarchive` toggle `active` idempotently and return `404` on unknown ID; archived part code remains conflict-locked on `POST /api/v1/parts`.
   - `GET /api/v1/parts/low-stock` returns only active low-stock parts sorted **numerically** (`currentQuantity = 2` before `currentQuantity = 10` when `minReorderLevel = 15`).
   - `GET /api/v1/parts` pagination (`page`, `size`), `includeArchived`, `category` (case-insensitive), `lowStockOnly=true`, and `search` substring matching across `partCode`, `name`, and `description`.
2. **Stock Movements Lifecycle:**
   - `STOCK_IN` and `RETURN` increase `currentQuantity` and update `lowStock`/`currentQuantityMinor`.
   - `STOCK_OUT` and `SERVICE_USAGE` decrease `currentQuantity` and reject overdrafts (`currentQuantity < requested`) with `400 BAD_REQUEST` and no state change.
   - `ADJUSTMENT` and `REVERSAL` apply positive `>= 0.01` delta; `<= 0` or negative `quantity` returns `400 VALIDATION_FAILED`.
   - Unknown `movementType` (including `'PURCHASE'` and `'USAGE_NON_SERVICE'`) returns `400 VALIDATION_FAILED`.
   - Movement on an archived part returns `400 BAD_REQUEST`.
   - Omitted `currency` defaults to `"RON"`, explicit `"currency": null` falls back to `part.costCurrency`, omitted/`null` `unitCost` falls back to `part.defaultUnitCost`.
   - `GET /api/v1/stock-movements/part/{partId}` returns movements sorted `createdAt DESC` and returns `[]` for unknown/empty `partId`.
   - `GET /api/v1/stock-movements` filters by `partId`, `type`, `startDate`, `endDate`, combinations thereof, and paginates properly.
3. **Suppliers Lifecycle:**
   - `POST /api/v1/suppliers` creates active supplier; duplicate name case-insensitively (`"Acme Parts"` vs `"  acme parts "`) returns `409 CONFLICT`.
   - `GET /api/v1/suppliers/{id}`, `archive`, `unarchive` (`200` / `404`), and `GET /api/v1/suppliers` filtering (`includeArchived`, `search` across all 5 fields).
4. **Concurrency & Safeguard Tests:**
   - Concurrent `Promise.all` `STOCK_OUT` requests against a part with stock `5.00` (e.g., two parallel deductions of `4.00`): exactly one succeeds (`201`, remaining stock `1.00`) and one fails (`400`), never going negative.
   - Concurrent `Promise.all` `POST /api/v1/parts` with the same `partCode` and `POST /api/v1/suppliers` with the same `name`: one `201`, one `409`.
   - Substring `search` exceeding `MAX_SEARCH_SCAN_DOCS` returns `422 UNPROCESSABLE_ENTITY`.

---

## 10. Implementation Sequence for Stage C5.1

Implement Stage C5.1 strictly in dependency order:

1. **Domain Types (`backend-firebase/src/domain/types.ts`):** Align `PartDocument` (`currentQuantityMinor`, `isLowStock`, etc.), `StockMovementDocument`, `SupplierDocument` (`nameNormalized`), `PartDto` (`lowStock` + `isLowStock`), `StockMovementDto`, `SupplierDto`, and safeguard constants.
2. **Firestore Indexes (`backend-firebase/firestore.indexes.json`):** Add the composite indexes defined in §8.2, preserve `fieldOverrides: []`, and validate JSON syntax / Firestore emulator index compatibility.
3. **Repositories:**
   - `backend-firebase/src/modules/inventory/supplier.repository.ts`
   - `backend-firebase/src/modules/inventory/part.repository.ts`
   - `backend-firebase/src/modules/inventory/stock-movement.repository.ts`
4. **Services & Input Parsers:**
   - `backend-firebase/src/modules/inventory/inventory.validation.ts` (strict scale-2 decimal parsing, DTO validation, currency/enum validation)
   - `backend-firebase/src/modules/inventory/supplier.service.ts`
   - `backend-firebase/src/modules/inventory/part.service.ts`
   - `backend-firebase/src/modules/inventory/stock-movement.service.ts`
5. **Controllers & App Wiring:**
   - `backend-firebase/src/modules/inventory/part.controller.ts`
   - `backend-firebase/src/modules/inventory/stock-movement.controller.ts`
   - `backend-firebase/src/modules/inventory/supplier.controller.ts`
   - Wire all three routers into `backend-firebase/src/app.ts` using `createAuthMiddleware(tokenService, userRepository)` without `ownerMiddleware`.
6. **Verification:**
   - Run TypeScript build/typecheck and unit tests.
   - Run full Firestore Emulator integration test suite across **3 consecutive runs** and confirm zero failures.

---

## 11. Unresolved Questions and Production-Readiness Gates

1. **Mobile Client `StockMovementType` Bug (`mobile/lib/features/inventory/screens/inventory_screen.dart`):**
   - *Observation:* Lines 37 and 68–78 of the Flutter inventory screen send `'PURCHASE'` and `'USAGE_NON_SERVICE'`, which are invalid `StockMovementType` enum constants in Java (`STOCK_IN`, `STOCK_OUT`, `SERVICE_USAGE`, `RETURN`, `ADJUSTMENT`, `REVERSAL`).
   - *Gate:* Before mobile cutover to `backend-firebase` (or Java), client teams must decide whether to fix Flutter to send `'STOCK_IN'` / `'STOCK_OUT'` (recommended, matching `web/src/App.tsx`). `backend-firebase` must **not** deviate from Java's enum contract.
2. **Negative `ADJUSTMENT` / `REVERSAL` Quantities:**
   - *Observation:* `RecordStockMovementRequest.quantity` carries `@DecimalMin("0.01")`, blocking negative adjustments via HTTP despite the service branch `ADJUSTMENT | REVERSAL -> quantity`.
   - *Gate:* Keep strict Java parity (`>= 0.01`) for migration cutover (`STOCK_OUT` performs reductions); revisit only as an explicit post-migration API enhancement if negative `ADJUSTMENT` payloads are desired.
3. **Catalog Growth Past `MAX_SEARCH_SCAN_DOCS` (1,000 Parts or Suppliers):**
   - *Gate:* While typical bike-shop catalogs stay well below 1,000 SKUs/suppliers, `GET /api/v1/parts?search=...` and `GET /api/v1/suppliers?search=...` enforce `MAX_SEARCH_SCAN_DOCS = 1000` (`422`) to protect latency and Firestore read costs. If production tenants exceed 1,000 active parts/suppliers and require substring `search`, integrate n-gram/token indexing or an external search index (Algolia/Typesense) before removing the safeguard.
4. **Stage C6 Servicing & Stage C7 Reports Handoff:**
   - *Gate:* Stage C6 (`ServicingService.logService`) must reuse the `parts` transactional helper rules in §6.2 Workflow F (duplicate `partId` aggregation, `isLowStock` & `currentQuantityMinor` recalculation, `SERVICE_USAGE` ledger entry creation, and `MAX_SERVICE_PARTS_ITEMS = 50`). Stage C7 (`ReportService`) must consume `parts.isLowStock` and `stock_movements.createdAt` (UTC date boundary) as defined in §3.9.

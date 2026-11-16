# Stage C4 – Payments Contract Audit & Implementation Specification

---

## Executive Summary

This document is the **verified implementation specification** for the payment module (Stage C4, API routes 31–37) of the Firebase migration. It is extracted directly from the Java Spring Boot source (`PaymentController.java`, `PaymentService.java`, all DTO and entity classes) and must be treated as the authoritative reference for the Firestore-based implementation in `backend-firebase`.

The specification covers:

1. The **seven payment endpoints (31–37)** with exact request/response shapes, validation, and error handling.
2. **Payment business rules** extracted from Java source: recording, AUTO_FIFO allocation, manual allocation, reversal, and balance summary.
3. **Firestore architecture** (collections, document schema, indexes, money representation, pagination).
4. **Transaction and concurrency design** for atomic payment creation and reversal.
5. **Java compatibility requirements** (JSON field names, date formats, pagination parameters, error codes).
6. **Testing specification** (unit, emulator integration, authorization).
7. File structure, dependencies, risks, and acceptance criteria.

Stage C4.1 implementation is complete in `backend-firebase` and verified against the Firestore Emulator; non-production cloud latency calibration and production index/app deployment remain pre-release gates (§10).

---

## 1. Endpoint Matrix (API routes 31–37)

**Verified against Java source** (`PaymentController.java`, DTO classes, `PaymentService.java`).

| # | HTTP Method | URL | Controller Method | Request DTO | Response DTO | Success Status | Auth |
|---|-------------|-----|-------------------|-------------|--------------|----------------|------|
| **31** | `POST` | `/api/v1/payments` | `recordPayment` | `RecordPaymentRequest` | `PaymentDto` | **201 Created** | Authenticated (`@AuthenticationPrincipal UserPrincipal`). No ownership check; authenticated user is recorded for audit only. |
| **32** | `POST` | `/api/v1/payments/{id}/reverse` | `reversePayment` | `ReversePaymentRequest` | `PaymentDto` | **200 OK** | Authenticated. No ownership enforcement; any authenticated user may reverse any payment. |
| **33** | `GET` | `/api/v1/payments/{id}` | `getPayment` | — | `PaymentDto` | **200 OK** | Authenticated (global security filter). |
| **34** | `GET` | `/api/v1/payments` | `searchPayments` | Query params: `status`, `currency`, `method`, `customerId`, `startDate`, `endDate`, `page`, `size`, `sort` | `PageResponse<PaymentDto>` | **200 OK** | Authenticated. |
| **35** | `GET` | `/api/v1/payments/customer/{customerId}` | `getPaymentsForCustomer` | — | `List<PaymentDto>` | **200 OK** | Authenticated. |
| **36** | `GET` | `/api/v1/payments/rental/{rentalId}` | `getPaymentsForRental` | — | `List<PaymentDto>` | **200 OK** | Authenticated. |
| **37** | `GET` | `/api/v1/payments/balance-summary/{customerId}` | `getCustomerBalanceSummary` | — | `CustomerBalanceSummaryDto` | **200 OK** | Authenticated. |

> **Auth column, all seven routes:** "Authenticated" means the Stage C2 authentication middleware only. There is **no owner/role restriction** (no `ownerMiddleware`), and authenticated non-owner users are allowed. See §1.8.

### 1.1 RecordPaymentRequest fields (verified)

| Field | Type | Constraint | Notes |
|-------|------|-----------|-------|
| `customerId` | `UUID` | `@NotNull` | Required |
| `rentalId` | `UUID` | optional | Optional rental scope |
| `paymentDate` | `LocalDate` | `@NotNull` | ISO date string in JSON |
| `amount` | `BigDecimal` | `@NotNull`, `@DecimalMin("0.01")`; **no `@Digits`** | Bean validation rejects amounts `< 0.01` (e.g. `0.005`). Scale > 2 (e.g. `1.005`) is **not** rejected at the DTO layer. No `setScale` / `RoundingMode` in the service. |
| `currency` | `String` | `@NotBlank`, `@Pattern(regexp = "^(RON|EUR|USD)$")` | Pattern is case-sensitive and does not trim. Lowercase (`eur`) and whitespace-padded (` EUR `) values are **rejected with 400** by `@Valid` before `PaymentService` runs. |
| `paymentMethod` | `PaymentMethod` enum | `@NotNull` | Strictly `CASH` or `BANK_TRANSFER` (verified in Java `PaymentMethod.java`) |
| `referenceNumber` | `String` | optional | — |
| `notes` | `String` | optional | — |
| `allocationMode` | `String` | optional, field initializer `"AUTO_FIFO"` | Java dispatch is `"MANUAL".equalsIgnoreCase(request.getAllocationMode())` (`PaymentService.recordPayment`): `MANUAL` is matched case-insensitively; **any other value, including `null` or an unknown string, runs AUTO_FIFO**. Firebase preserves this dispatch rule. |
| `manualAllocations` | `List<ManualAllocationItem>` | optional; field initializer `new ArrayList<>()`; **no `@NotEmpty` / `@Valid`** | **Not required by Java even when `MANUAL`.** Absent, `null`, or `[]` with `MANUAL` → payment is recorded with **zero allocations** (verified: `allocateManually` returns early). See §2.2 MANUAL rule 0. |

**ManualAllocationItem fields:**

| Field | Original Java Declaration | Firebase Stage C4 Contract | Constraint & Notes |
|-------|---------------------------|----------------------------|-------------------|
| `rentalChargeId` | `UUID` (`java.util.UUID`) | `String` (`string`) | `@NotNull`. In original Java, this field was declared as a relational `UUID`. In Firebase Stage C4, this is a **DOCUMENTED COMPATIBILITY DEVIATION**: it is declared and validated as a non-empty `string` matching the Stage C3 deterministic charge document ID `"${rentalId}_${sequence}"` (as returned by Stage C3 `RentalChargeDto.id`). Validated to reference an existing charge document. |
| `amount` | `BigDecimal` (`java.math.BigDecimal`) | `number \| string` | `@NotNull`, `@DecimalMin("0.01")`; **no `@Digits`** in Java. Accepted on API wire as a JSON number (validated on its parsed value) or a numeric string (validated lexically) — see §2.3 for the exact, enforceable rule; stored in Firestore as a canonical scale-2 decimal string. |

> **Note:** The JSON field in `ManualAllocationItem` is **`amount`**, not `allocatedAmount`. The getter `getAllocatedAmount()` is an alias that returns the same field. `RecordPaymentRequest.manualAllocations` has **no `@Valid`**, so nested bean-validation annotations on `ManualAllocationItem` are not enforced by the controller; the service rejects non-positive amounts with `compareTo(BigDecimal.ZERO) <= 0`.

### 1.2 ReversePaymentRequest fields (verified)

| Field | Type | Constraint |
|-------|------|-----------|
| `reason` | `String` | `@NotBlank`, `@Size(min=5, max=500)` |

### 1.3 PaymentDto fields (verified)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `UUID` | — |
| `customerId` | `UUID` | — |
| `customerName` | `String` | Denormalized from `Customer.getFullName()` |
| `rentalId` | `UUID` (nullable) | — |
| `paymentDate` | `LocalDate` | Serialized as `"yyyy-MM-dd"` |
| `amount` | `BigDecimal` | Wire JSON type: see §1.7 (not assumed to be a string) |
| `currency` | `String` | — |
| `paymentMethod` | `PaymentMethod` | Enum string |
| `referenceNumber` | `String` (nullable) | — |
| `notes` | `String` (nullable) | — |
| `status` | `PaymentStatus` | `CONFIRMED` or `REVERSED` |
| `recordedByUserName` | `String` | From `AppUser.getFullName()` |
| `allocations` | `List<PaymentAllocationDto>` | — |
| `reversalReason` | `String` (nullable) | Present when reversed |
| `reversedAt` | `Instant` (nullable) | Present when reversed |
| `createdAt` | `Instant` | — |

### 1.4 PaymentAllocationDto fields (verified)

| Field | Original Java Declaration | Firebase Stage C4 Contract | Notes |
|-------|---------------------------|----------------------------|-------|
| `id` | `UUID` (`java.util.UUID`) | `string` (UUID string) | Auto-generated by JPA (`@GeneratedValue`) in Java; generated UUID string in Firebase. |
| `paymentId` | `UUID` (`java.util.UUID`) | `string` (UUID string) | Parent payment ID. |
| `rentalChargeId` | `UUID` (`java.util.UUID`) | `string` (`"${rentalId}_${chargeSequence}"`) | **DOCUMENTED COMPATIBILITY DEVIATION**: In original Java, `PaymentAllocation.rentalChargeId` was declared as a relational `UUID` (mapping `@JoinColumn(name = "rental_charge_id")` to `RentalCharge.id`). In Firebase Stage C4, this field is a `string` storing the deterministic Stage C3 document ID format `"${rentalId}_${chargeSequence}"` (e.g. `"r456f789-1234-56d7-b890-123456789abc_1"`). See §3.2 for details. |
| `chargeSequence` | `int` | `number` | Charge sequence integer. |
| `chargeDueDate` | `LocalDate` | `string` (`"yyyy-MM-dd"`) | ISO date string. |
| `allocatedAmount` | `BigDecimal` | `number` | Wire JSON type: JSON number via `moneyToJson()` (see §1.7, §3.1). |
| `currency` | `String` | `string` | Currency uppercase code (`RON`, `EUR`, `USD`). |
| `allocatedAt` | `Instant` | `string` (ISO timestamp) | Serialized timestamp. |

> **Important – Rental charge ID format and allocation storage:** In Java Spring Boot relational PostgreSQL, `RentalCharge.id` was a random UUID. However, Stage C3 established a deterministic Firestore document ID convention for charges: `rental_charges/{rentalId}_{sequence}` (e.g. `"r456f789-1234-56d7-b890-123456789abc_1"`), which is also returned as `RentalChargeDto.id` by the Stage C3 API.
> In Firestore:
> - Payment allocations store `rentalChargeId` as the exact string matching `rental_charges.id` (i.e. `"${rentalId}_${sequence}"`).
> - In `RecordPaymentRequest.manualAllocations`, the incoming `rentalChargeId` must match this Stage C3 charge identifier format (`${rentalId}_${sequence}` or string ID). If legacy clients submit UUIDs, or if direct point lookups are performed, the service resolves the document reference using `doc(rentalChargeId)` directly on the `rental_charges` collection.
> - In AUTO_FIFO, the charge documents retrieved from the query supply their `charge.id` (`"${rentalId}_${sequence}"`) directly to the created `PaymentAllocation.rentalChargeId`.
> - On reversal, the allocation documents supply `allocation.rentalChargeId`, enabling direct point-reads of `rental_charges/{rentalChargeId}` without reverse engineering or index scans.

> **Important – allocation ID design:** The Java `PaymentAllocation` entity uses a JPA auto-generated `UUID` as its primary key. Java does **not** enforce a uniqueness constraint of `(paymentId, rentalChargeId)` at the entity level, meaning the same charge can receive multiple allocation records from the same payment (e.g., via multiple manual allocation items). Therefore, the Firestore allocation document ID **must not** use the deterministic `${paymentId}_${rentalChargeId}` pattern, as this would silently overwrite an earlier allocation for the same charge. Use a fully random UUID (matching the Java auto-generated behavior) or a deterministic ID that includes a sequence suffix (e.g., `${paymentId}_${rentalChargeId}_${seq}`) to remain collision-safe. This does not change the public API contract.

### 1.5 Error mapping (verified)

| Exception | HTTP Status |
|-----------|-------------|
| `ResourceNotFoundException` | 404 Not Found |
| `BusinessException` | Payment-module call sites use `new BusinessException(message)` → default **`HttpStatus.BAD_REQUEST` (400)** via `GlobalExceptionHandler` / `BusinessException`. No payment call site passes a custom status. |
| Bean-validation errors (`@NotNull`, `@DecimalMin`, etc.) | 400 Bad Request with field-error details |

### 1.6 Search query parameters (verified from controller)

The `searchPayments` endpoint uses `@RequestParam` individually, not a single `Pageable` body:

| Parameter | Type | Notes |
|-----------|------|-------|
| `status` | `PaymentStatus` | Optional |
| `currency` | `String` | Optional |
| `method` | `PaymentMethod` | **`method`** is the query param name (matches `@RequestParam PaymentMethod method`) |
| `customerId` | `UUID` | Optional |
| `startDate` | `LocalDate` (ISO date) | Optional |
| `endDate` | `LocalDate` (ISO date) | Optional |
| `page` | `int` | Spring `Pageable`, default 0 |
| `size` | `int` | Spring `Pageable`, default 20 |
| `sort` | `String` | Spring `Pageable`, default `paymentDate,DESC` |

### 1.7 BigDecimal JSON serialization and wire compatibility

| Evidence source | Finding |
|-----------------|---------|
| `PaymentDto` / `PaymentAllocationDto` / `CustomerBalanceSummaryDto` | Plain `BigDecimal` fields; **no** `@JsonSerialize`, `@JsonFormat`, or `@JsonRawValue` annotations |
| `application.yml` | No `spring.jackson.*` overrides for BigDecimal or serialization as string |
| Project Java sources | **No** custom `ObjectMapper` / Jackson `WebMvcConfigurer` bean modifying numeric serialization |
| Default Jackson `ObjectMapper` (jackson-databind 2.19.2) | Serializes `BigDecimal` as JSON **numbers** (e.g. `{"amount":250.00,"allocatedAmount":150.50}`) |
| Live Spring HTTP wire response from running server | **NOT CAPTURED** (Java server was not booted with a network client in this audit) |

**Compatibility stance and verified boundaries:**
- Java DTOs produce JSON numbers by default Jackson behavior.
- In `backend-firebase`, Stage C3 established `moneyToJson()` in `shared/money.ts`, converting stored decimal strings into JSON numbers (via `Number(value)`) for API responses.
- Stage C4 payment response DTOs (`PaymentDto`, `PaymentAllocationDto`, `CustomerBalanceSummaryDto`) will likewise return JSON numbers for numeric amounts via `moneyToJson()`.
- On API request bodies, JSON numbers and JSON numeric strings are both accepted. Because `express.json()` (Stage C2 `app.ts`) uses `JSON.parse`, a JSON numeric token's original spelling is **not** preserved (e.g. `1.000` arrives as the JavaScript number `1`). Numbers are therefore validated on their parsed value and numeric strings lexically; the exact rule is in §2.3.
- **Verification boundary:** Exact bit-for-bit HTTP response wire parity (e.g., trailing zero formatting like `250.0` vs `250.00` in standard JSON engines) remains an **unverified assumption** until captured from a live Java Spring Boot test. Do not claim absolute wire-level parity without captured HTTP traces.

### 1.8 Authentication & authorization contract (all seven routes)

**Java evidence:**

| Source | Finding |
|--------|---------|
| `SecurityConfig.filterChain` | Only `/api/v1/auth/login`, `/api/v1/auth/bootstrap-owner`, Swagger/API-docs and `/actuator/health` are `permitAll()`; everything else is `.anyRequest().authenticated()`. |
| `PaymentController` | No `@PreAuthorize`, `@Secured`, `@RolesAllowed` or role check on any of the seven methods. `@AuthenticationPrincipal UserPrincipal` is used only to pass `userId` to the service for audit. |
| Whole Java tree (`backend/src/main/java`) | A search for `PreAuthorize`, `hasRole` and `ROLE_CUSTOMER` returns no matches. |

Therefore, Java payment routes require **authentication only**. Any authenticated user, whatever their role, may call them.

**Firebase requirements (locked):**

1. The payment router applies **only** `createAuthMiddleware(firestore, config)` (Stage C2, `src/middleware/auth.middleware.ts`) to all seven routes: `router.use(createAuthMiddleware(firestore, config))`.
2. The payment router **must not** apply `ownerMiddleware` (`src/middleware/owner.middleware.ts`, which returns `403 FORBIDDEN "Access denied"` for any role other than `ROLE_OWNER`) or any other role restriction.
3. Authenticated non-owner users (e.g. a valid `ROLE_CUSTOMER` token, as already seeded by Stage C2/C3 `tests/authorization.test.ts`) **must reach the payment handlers**. They must never get a 403 because of their role.
4. Authentication is not weakened. Stage C2 rejections still apply unchanged. Each one throws `AuthError(401, 'UNAUTHORIZED', 'Authentication required')`, which `errorMiddleware` renders as `{ timestamp, status: 401, error: "UNAUTHORIZED", message: "Authentication required", path }`:
   - missing `Authorization` header, a header without the `Bearer ` prefix, or an empty token (`auth.middleware.ts`);
   - an invalid signature, a wrong algorithm, an expired token, or a non-object payload (`JwtService.verify`);
   - a non-string `userId` claim (`auth.middleware.ts`);
   - no `app_users/{userId}` document (`auth.middleware.ts` → `UserRepository.findById`);
   - mismatched `sub`/`userId`/`role`, missing `iat`/`exp`, an inactive user, an `authVersion` mismatch, or `iat <= tokenIssuedBefore` (revoked) (`JwtService.validateClaims`).
5. This decision is scoped to `/api/v1/payments/**`. The Stage C3 rental and rental-charge routers keep their existing `ownerMiddleware` unchanged. Stage C4 does **not** change authorization for any other module.

---

## 2. Payment Business Rules

**All rules verified from Java source (`PaymentService.java`).**

### 2.1 Payment Recording

- `customerId` is required; customer is loaded from the repository. Missing → 404.
- **Currency validation order (verified from Java source):** In `PaymentController.recordPayment`, the request body is annotated with `@Valid`. Therefore, Jakarta Bean Validation (`@NotBlank` and `@Pattern(regexp = "^(RON|EUR|USD)$")` in `RecordPaymentRequest.java`) executes **before** the controller invokes `PaymentService.recordPayment`. Any lowercase (e.g. `eur`), mixed-case, or whitespace-padded (e.g. ` EUR `) input is rejected immediately with **HTTP 400 Bad Request** at the validation layer. The subsequent `SupportedCurrency.isValid(request.getCurrency())` and `request.getCurrency().toUpperCase().trim()` in `PaymentService.java` (and the entity constructor) are strictly internal defensive guards that are never reached with invalid HTTP inputs. Accepted request values on the API are exclusively the exact uppercase strings `RON`, `EUR`, and `USD`. Firebase API validation mirrors this by strictly validating the exact regex `^(RON|EUR|USD)$` before executing service logic.
- If `rentalId` is provided, the rental is loaded and its `customer.id` must equal `customerId`; mismatch → `BusinessException` (HTTP 400).
- **Audit-user identity and user document read (verified from Stage C2 & Java):**
  - In Java, `Payment` stores `recordedByUser` (`AppUser`), and `PaymentDto` maps `payment.getRecordedByUser().getFullName()` to `recordedByUserName`.
  - In Stage C2 (`auth.middleware.ts` and `jwt.service.ts`), `request.authenticatedUser` contains `{ id, email, role, authVersion, issuedAt }`. It does **not** include `fullName`.
  - Therefore, both payment creation **and** reversal must point-read `app_users/{authenticatedUser.id}` in the transaction read phase (the Stage C2 collection is `app_users`, `src/auth/user.repository.ts` `USERS = 'app_users'`). On creation, this read supplies `user.fullName` for `recordedByUserName` and `recordedByUserId`. On reversal, it mirrors Java's `appUserRepository.findById(userId)` existence check.
  - For reversal, `reversedByUserId` is populated from `request.authenticatedUser.id` (equal to the document ID that was read).
  - **Missing audit-user profile, exact response (locked):**
    | Case | Where detected | Response |
    |------|----------------|----------|
    | Invalid, expired, malformed or revoked credentials | Stage C2 `createAuthMiddleware` / `JwtService` | **401**, `{ timestamp, status: 401, error: "UNAUTHORIZED", message: "Authentication required", path }` |
    | Valid JWT, but `app_users/{userId}` is missing when the request arrives | Stage C2 `createAuthMiddleware` (`users.findById` → `undefined`) | Same **401** body as above. The payment handler is never reached. |
    | Valid JWT, middleware passed, but `app_users/{authenticatedUser.id}` is missing in the transaction read phase (e.g. deleted concurrently) | Payment transaction read phase | Throw `AuthError(401, 'UNAUTHORIZED', 'Authentication required')` → same **401** body. Abort before any write; zero documents changed. |
  - **Compatibility note (documented deviation):** In the third case, Java's service would throw `ResourceNotFoundException("User", userId)` → 404. Firebase deliberately returns 401 so that a missing user profile is handled the same way at every layer, as Stage C2 already does. A 404 is never returned for a missing audit user.
  - The Java fallback in `PaymentService.java` (`appUserRepository.findAll().stream().findFirst()`) when `userId == null` is **intentionally omitted** as an unsafe anti-pattern. Authenticated requests via `createAuthMiddleware` always carry a valid `authenticatedUser.id`.
- Payment is saved first (status `CONFIRMED`), then allocation is performed in the same `@Transactional` method.

### 2.2 Allocation Logic

#### AUTO_FIFO

1. Fetches eligible `rental_charges` for the customer (or the specific rental if `rentalId` was supplied) with status `UNPAID` or `PARTIALLY_PAID` and matching `currency`, ordered by `dueDate ASC`.
2. For each charge, queries `paymentAllocationRepository.sumAllocatedForCharge(chargeId)` to get the already-paid `BigDecimal` total (null treated as zero).
3. Computes `unpaidOnCharge = charge.amount – paidSoFar`.
4. Allocates `min(remainingPayment, unpaidOnCharge)` to the charge.
5. Saves a `PaymentAllocation` with `allocatedAmount` and `currency`.
6. Updates `charge.status` to `PAID` or `PARTIALLY_PAID` and saves the charge.
7. Repeats until `remainingToAllocate <= 0` or no more eligible charges.
7a. **Status-correction writes (verified, `PaymentService.allocateAutoFifo` lines 134–138):** If an eligible charge already has `unpaidOnCharge <= 0`, Java sets it to `PAID` and saves it **without** creating an allocation, then continues. Firebase must do the same. Such charges count toward `N_affected_charges` and the projected write total (§4.2).
8. **Remaining unallocated payment behaviour (verified from Java source):**
   - When the payment amount exceeds the total eligible unpaid charge balance, or when all eligible charges are satisfied while `remainingToAllocate > 0`, the loop simply terminates.
   - The payment entity has already been created and saved with its full `amount` and status `CONFIRMED`.
   - The unallocated portion is **retained as an unallocated payment balance** on the payment document.
   - It is **not** rejected with an error, **not** rounded down, and **not** artificially allocated to charges of another customer or currency.
   - In the Customer Balance Summary (route 37), `totalPaid` includes the **full confirmed payment amount** (`sum(payments.amount where status == CONFIRMED)`), so unallocated payments correctly reduce the customer's total outstanding debt across charges.

#### MANUAL

0. **Absent, `null`, or empty `manualAllocations` (verified from Java source):**

   | Input with `allocationMode` matching `MANUAL` (case-insensitive) | Java behaviour (evidence) | Firebase behaviour (locked) |
   |------|------|------|
   | `manualAllocations` absent | Field initializer `= new ArrayList<>()` (`RecordPaymentRequest`) → empty list → `allocateManually` returns early (`if (… == null \|\| … .isEmpty()) return;`) → payment saved `CONFIRMED`, zero allocations, **201** | Same: **201**, `CONFIRMED` payment, `allocations: []`, no charge reads or writes |
   | `manualAllocations: null` | Jackson setter assigns `null`; no `@NotNull`/`@Valid` → same early return → **201**, zero allocations | Same: **201**, zero allocations |
   | `manualAllocations: []` | Same early return → **201**, zero allocations | Same: **201**, zero allocations |

   The whole amount stays an **unallocated payment balance**, exactly as for AUTO_FIFO leftovers (§2.2 AUTO_FIFO rule 8). It counts in `totalPaid` for the balance summary. This is **Java parity, not a deviation**. It is handled by an explicit early branch, never by a runtime exception. A non-array `manualAllocations` value (e.g. an object or string) is rejected with **400** `VALIDATION_FAILED`. Java would also fail deserialization with 400, but the exact Java error body for that case is **not verified**.
   - In the transaction, this case still reads `customers/{customerId}`, `app_users/{authenticatedUser.id}` and the optional `rentals/{rentalId}`, then writes only the `payments` document (1 write).

1. Checks sum of all `manualAllocations[].amount` against `payment.amount`; total exceeding payment → `BusinessException` (HTTP 400).
2. **Repeated allocation entries for the same charge:**
   - In Java `PaymentService.java` (lines 172–209), the service iterates sequentially over `request.getManualAllocations()`. For each item, it re-queries `sumAllocatedForCharge(charge.getId())` and verifies `item.amount <= unpaid`.
   - In Firestore transactions, **all reads must precede all writes**. To correctly handle multiple manual allocation entries that reference the **same** `rentalChargeId`, the Firestore implementation must:
     a. **Read all individually referenced rental charge documents** (`rental_charges/{rentalChargeId}`) in the read phase.
     b. **Group manual allocation items by `rentalChargeId`**.
     c. **Calculate the combined requested allocation amount per charge** using BigInt `addMoney`.
     d. **Read existing confirmed allocation totals** for each unique referenced charge (reading allocations and parent payment statuses).
     e. **Validate the combined requested amount per charge against the unpaid balance**: `combinedRequestedAmount <= (charge.amount - paidSoFar)`. If any charge is over-allocated, reject the entire request with HTTP 400 before performing any writes.
     f. Validate that every referenced charge belongs to the customer and matches the payment currency.
     g. Validate that total requested allocations across all items do not exceed the payment amount.
     h. Reject the entire transaction with zero writes if any validation fails.
     i. During the write phase, write each distinct `PaymentAllocation` document (preserving each individual allocation line item with a unique UUID for audit fidelity), and write the updated `rental_charges` document with its final recomputed `paidAmount` and `status`.

### 2.3 Money Calculations — precision policy (locked)

**Java / Stage C3 evidence:**

| Layer | Evidence | Behaviour |
|-------|----------|-----------|
| DTO | `@DecimalMin("0.01")`, **no `@Digits`** | `0.005` rejected; `1.005` / `1.001` accepted |
| Service | No `setScale` / `RoundingMode` | Arithmetic uses deserialized scale |
| JPA column | `precision = 14, scale = 2` | Persisted scale is 2 |
| `money-utils` | `normalizeMoney` | Would round `"1.005"` → `"1.01"`, `"1.001"` → `"1.00"` |

**Locked Firebase input policy: reject more than two fractional digits.**

| Rule | Behaviour |
|------|-----------|
| Canonical store / response money | Scale-2 decimal **string** in Firestore; JSON **number** on API responses (§1.7) |
| Request JSON parsing & types | Request bodies are parsed by `express.json({ limit: '1mb' })` (Stage C2 `app.ts`), which uses `JSON.parse`. **`JSON.parse` does not preserve a numeric token's lexical spelling:** `1.000` becomes the number `1`, `250.50` becomes `250.5`, and `1.0000000000000001` becomes `1`. Stage C4 does **not** use a raw-token-preserving parser. The enforceable policy is: **JSON numbers are validated on their parsed value; JSON strings are validated lexically.** Any other type (`boolean`, `object`, `array`, `null` for a required amount) → **HTTP 400**. |
| Rule N (JSON number) | Must be a finite `number`. Convert it with `String(value)`, which gives ECMAScript's shortest round-trip decimal form. That form must match `^(0\|[1-9]\d*)(\.\d{1,2})?$`, so at most two fractional digits, no sign, and no exponent. Otherwise → **400**. Examples: `250.50` → `"250.5"` ✓; `1.000` → `"1"` ✓ (accepted, because the trailing zeros are lost during parsing); `1.005` → `"1.005"` ✗; `1e-7` → `"1e-7"` ✗; `1e21` → `"1e+21"` ✗. |
| Rule S (JSON string) | Trim surrounding whitespace (existing Stage C4 decision). The trimmed text must match `^(0\|[1-9]\d*)(\.\d{1,2})?$`. The **written** fractional digits are counted, so `"1.000"` ✗ and `"1.005"` ✗, while `"250.50"` ✓ and `"1"` ✓. Exponent, sign, and empty strings → **400**. |
| Known asymmetry (documented) | JSON number `1.000` is accepted (its value has no more than two decimals), but string `"1.000"` is rejected (three written decimals). This follows directly from `JSON.parse` semantics and is intended. Clients that need strict lexical checking must send strings. |
| Fractional digits | Rules N and S above. Violations → **HTTP 400** `VALIDATION_FAILED` with field `amount` / `manualAllocations[i].amount`. Do **not** silently round. The Stage C3 `normalizeMoney` rounds half-up (`digits[2] >= '5'`), so it **must not** be used to validate payment inputs. A strict, non-rounding parser is a Stage C4 implementation requirement. Once validated, the value is converted to the canonical scale-2 string. |
| Minimum | Still enforce `>= 0.01` (same floor as `@DecimalMin`), using BigInt minor units after Rule N/S. Values `< 0.01` (e.g. `0.005`, `0`, `-10`) → **HTTP 400**. Note that `0.005` already fails Rule N/S because it has three decimals. |
| Valid examples | Number `250.50`, string `"250.50"`, number `1`, number `1.000`, string `"1.00"` → stored as `"250.50"` / `"1.00"` |
| Invalid examples | Number `1.005`, string `"1.005"`, string `"1.000"` → **400**; `0.005`, `"0.005"`, `0`, `"0.00"` → **400**; `"abc"`, `"1e2"`, `true`, `{}` → **400** |

**Java compatibility difference (explicit non-parity):** Java accepts `1.005` / `1.001` at the DTO and may use that scale in-memory until DB scale-2 persistence. Firebase **rejects** those inputs. Exact Java parity for scale > 2 is **not** claimed.

**Required tests (unit + Express integration):**

| Input | Expected Firebase result |
|-------|--------------------------|
| JSON number `250.50` | 201 (create) / accepted allocation amount |
| JSON numeric string `"250.50"` | 201 (create) / accepted allocation amount |
| JSON number `1.00` | 201 (create) / accepted allocation amount |
| JSON numeric string `"1.00"` | 201 (create) / accepted allocation amount |
| JSON number `1.000` (parses to `1`) | 201 — accepted per Rule N (documented asymmetry) |
| JSON numeric string `"1.000"` | 400 — three written fractional digits (Rule S) |
| JSON number `1.005` | 400 — more than two fractional digits |
| JSON numeric string `"1.005"` | 400 — more than two fractional digits |
| JSON number `1.001` | 400 — more than two fractional digits |
| JSON number `0.005` | 400 — below minimum (`< 0.01`) / invalid scale |
| JSON numeric string `"0.005"` | 400 — below minimum (`< 0.01`) / invalid scale |
| JSON number `0` / string `"0.00"` | 400 — below minimum |
| JSON number `1e-7` / string `"1e2"` | 400 — exponent form rejected |
| Non-numeric string `"invalid"`, `true`, `{}` | 400 — invalid decimal format / type |

**Confirmed-allocation totals (matches Java `sumAllocatedForCharge`):**

Java JPQL sums `allocatedAmount` only where `pa.payment.status = 'CONFIRMED'`. Firestore must:

1. Query `payment_allocations` where `rentalChargeId == chargeId`.
2. Collect distinct parent `paymentId` values from those allocation docs.
3. **Read every such `payments/{paymentId}` document inside the transaction before any write** and use that document’s `status` field.
4. Sum only allocations whose parent `status == CONFIRMED`, using `money-utils` `addMoney` on scale-2 strings.
5. **Parent payment status determination:** All allocations evaluate confirmed status exclusively by reading the actual parent `payments/{paymentId}` document within the transaction. Denormalized `paymentStatus` on allocation documents is **prohibited** as a source of truth. Parent payment reads are mandatory inside the atomic transaction before computing totals or performing writes.

No Firestore numeric `increment` is used; charge `paidAmount` is recomputed from the confirmed sum on create and reverse.

### 2.4 Reversal (verified from Java source)

**Verified Java behavior:**

1. Payment is loaded. If `status == REVERSED`, throws `BusinessException` ("Payment is already reversed").
2. Payment `status` is set to `REVERSED` and saved **before** charge recalculation.
3. For **each allocation** on the reversed payment, the service:
   - Calls `sumAllocatedForCharge(charge.id)`. That JPQL sums `allocatedAmount` only where **`pa.payment.status = 'CONFIRMED'`** (`PaymentAllocationRepository`), so the just-reversed payment’s allocations are **excluded** after the status flush.
   - Re-evaluates charge status: 0 → `UNPAID`, < charge.amount → `PARTIALLY_PAID`, ≥ charge.amount → `PAID`.
   - Saves the charge.
4. Creates a `PaymentReversal` record with `reason` and the auditing user.
5. Returns the updated `PaymentDto` including reversal details.

> **Critical nuance:** Allocation rows are **not deleted** on reversal (audit trail preserved), but charge paid totals and status **do** drop the reversed payment because `sumAllocatedForCharge` filters `CONFIRMED` payments only. Balance summary likewise excludes `REVERSED` payments from `totalPaid` (see §2.5). Firestore must keep allocation documents, filter confirmed parents when summing, and update charge `paidAmount` / `status` accordingly.

### 2.5 Balance Summary (verified)

- Aggregates `rental_charges` totals by currency per customer → `totalBilled`.
- Aggregates `payments` with `status == CONFIRMED` by currency per customer → `totalPaid`.
- Payments with `status == REVERSED` are **excluded from `totalPaid`**.
- `totalOutstanding = max(0, totalBilled – totalPaid)` per currency.
- Three currency balances are always returned (`RON`, `EUR`, `USD`), defaulting to zero.

---

## 3. Firestore Architecture Design

### 3.1 Money Representation & Response Serialization

- **Firestore monetary storage:** All monetary amounts are stored as **canonical two-decimal decimal strings** in Firestore documents, following the Stage C3 `money-utils` convention established for `rental_charges`. Examples: `"250.00"`, `"0.01"`, `"1234.56"`.
- **API response monetary values:** All monetary fields in API response payloads (`PaymentDto.amount`, `PaymentAllocationDto.allocatedAmount`, `CustomerBalanceSummaryDto` balances, `RentalChargeDto.amount`, `RentalChargeDto.paidAmount`, `RentalChargeDto.remainingAmount`) are returned as **JSON numbers** using `moneyToJson()` from `shared/money.ts`. API responses do **not** return decimal strings.
- **API request validation:** Incoming monetary fields (`RecordPaymentRequest.amount`, `ManualAllocationItem.amount`) enforce the locked policy: at most two fractional digits (JSON numbers on their parsed value, Rule N; numeric strings lexically, Rule S) and a minimum of `0.01`. Violations → HTTP 400 (§2.3).
- **Arithmetic:** All calculations (remaining balance, confirmed-allocation sum, charge status threshold comparison) use the project's BigInt-based `money-utils` (`addMoney`, `subtractMoney`, `maxZero`) to prevent floating-point imprecision.
- **No integer-cent fields:** `amount_cents`, `allocated_cents`, `paid_cents`, and `toCents`/`fromCents` are prohibited.
- **No Firestore numeric `increment` transform:** Charge `paidAmount` is recomputed from the **CONFIRMED**-payment allocation sum on every allocation write and on reversal.

### 3.2 Collections & Document Schema

| Collection | Document ID | Key Fields |
|-----------|------------|------------|
| `payments` | UUID (matches Java `Payment.id`) | `customerId`, `rentalId` (nullable), `paymentDate` (**canonical string** `"yyyy-MM-dd"` only — no Timestamp), `amount` (decimal string), `currency`, `paymentMethod` (enum string), `status` (`CONFIRMED`/`REVERSED`), `allocationMode`, `referenceNumber` (nullable), `notes` (nullable), `recordedByUserId`, `recordedByUserName`, `customerName`, `createdAt`, `updatedAt` |
| `payment_allocations` | Random UUID (see §1.4 ID collision note) | `paymentId`, `rentalChargeId`, `allocatedAmount` (decimal string), `currency`, `chargeSequence`, `chargeDueDate` (string), `allocatedAt` |
| `payment_reversals` | Auto-generated | `paymentId`, `reason`, `reversedByUserId`, `reversedAt`, `createdAt` (Firebase-internal; set to the same `Timestamp` as `reversedAt`) |
| `rental_charges` (existing, Stage C3) | `{rentalId}_{sequence}` | `amount` (decimal string), `paidAmount` (decimal string, recomputed), `remainingAmount` (decimal string, derived), `status`, `currency`, `dueDate`, … |

**Charge `paidAmount` and `remainingAmount`** are recomputed and written on every allocation (create-payment) and on every charge-status update (reversal). They are not authoritative sources; the authoritative value is the sum of `payment_allocations.allocatedAmount` for the charge **whose parent payment status is `CONFIRMED`**.

### 3.3 Query-to-Index Matrix

Compared against `backend-firebase/firestore.indexes.json` in the repo (local definition only). **Deployed production index availability is NOT claimed.** All 33 payment composite indexes were added to `backend-firebase/firestore.indexes.json` in Stage C4.1 and verified with live queries against the Firestore Emulator (`tests/indexes.test.ts`); non-production cloud Firestore project deployment and latency validation remain **UNVERIFIED**.

#### Required Firestore queries (by feature)

| Feature | Collection | Query shape (equality / range / order) | Index type needed |
|---------|------------|----------------------------------------|-------------------|
| Payment details | `payments` | `doc(id)` get | None (document get) |
| Payment allocations | `payment_allocations` | `paymentId == X` | Single-field automatic on `paymentId` |
| Payment reversal lookup | `payment_reversals` | `paymentId == X` | Single-field automatic on `paymentId` |
| Allocations by rental charge (confirmed sum) | `payment_allocations` (+ parent `payments` status check) | `rentalChargeId == X` then read parent `payments` to verify `status == CONFIRMED` | Automatic single-field index on `rentalChargeId`. Firestore automatically indexes each single field by default. `fieldOverrides` in `firestore.indexes.json` contains no exclusions. (Note: `firestore.indexes.json` also contains a historical single-field entry in the `indexes` array, but single-field indexing is intrinsically active by default). |
| Payments by customer | `payments` | `customerId == X` `orderBy paymentDate DESC` | Composite: `customerId ASC`, `paymentDate DESC` |
| Payments by rental | `payments` | `rentalId == X` `orderBy paymentDate DESC` | Composite: `rentalId ASC`, `paymentDate DESC` |
| Customer balance – billed | `rental_charges` | `customerId == X` (group by `currency` in app) | Single-field automatic on `customerId` (existing charge composites with `customerId` already in local JSON) |
| Customer balance – paid | `payments` | `customerId == X` AND `status == CONFIRMED` (group by `currency` in app) | Composite: `customerId ASC`, `status ASC` (or scan customer payments and filter in app) |
| AUTO_FIFO charges by rental | `rental_charges` | `rentalId == X` AND `status in [...]` `orderBy dueDate ASC` (+ currency filter in app, matching Java) | Existing local composites: `status`+`rentalId`+`dueDate`; `rentalId`+`dueDate` |
| AUTO_FIFO charges by customer | `rental_charges` | `customerId == X` AND `currency == Y` AND `status in [...]` `orderBy dueDate ASC` | Existing local composite: `status`+`currency`+`customerId`+`dueDate` |
| Payment search (route 34) | `payments` | All 16 equality subsets; sort locked in §3.4 | **Full composite index strategy** (locked — no hybrid alternative) |

#### Locked search strategy: full composites (not hybrid)

**Decision:** Execute one Firestore query that applies **all** provided equality filters and the `paymentDate` range (if any), then `orderBy('paymentDate', dir)` + `orderBy(FieldPath.documentId(), dir)`. Use Stage C3 `count()` for `totalElements` and `limit`/`startAfter` page traversal. **Do not** use hybrid in-memory filtering for route 34.

Java `PaymentRepository.searchPayments` accepts all **16** equality subsets of `{status, currency, paymentMethod, customerId}` plus optional `startDate`/`endDate`. Each subset must have a matching composite (both ASC and DESC on `paymentDate`).

| # | Equality filters | Required composites (each direction) | Composite Index Definitions (ASC & DESC) |
|---|------------------|--------------------------------------|-------------------------------------------|
| 0 | *(none)* | Single-field date ordering | Single-field `paymentDate` ASC, `paymentDate` DESC |
| 1 | `status` | `status ASC`, `paymentDate` ASC\|DESC | 1. `status ASC, paymentDate ASC`<br>2. `status ASC, paymentDate DESC` |
| 2 | `currency` | `currency ASC`, `paymentDate` ASC\|DESC | 3. `currency ASC, paymentDate ASC`<br>4. `currency ASC, paymentDate DESC` |
| 3 | `paymentMethod` | `paymentMethod ASC`, `paymentDate` ASC\|DESC | 5. `paymentMethod ASC, paymentDate ASC`<br>6. `paymentMethod ASC, paymentDate DESC` |
| 4 | `customerId` | `customerId ASC`, `paymentDate` ASC\|DESC | 7. `customerId ASC, paymentDate ASC`<br>8. `customerId ASC, paymentDate DESC` *(also covers Route 35)* |
| 5 | `status`+`currency` | `status`, `currency`, `paymentDate` ASC\|DESC | 9. `status ASC, currency ASC, paymentDate ASC`<br>10. `status ASC, currency ASC, paymentDate DESC` |
| 6 | `status`+`paymentMethod` | `status`, `paymentMethod`, `paymentDate` ASC\|DESC | 11. `status ASC, paymentMethod ASC, paymentDate ASC`<br>12. `status ASC, paymentMethod ASC, paymentDate DESC` |
| 7 | `status`+`customerId` | `status`, `customerId`, `paymentDate` ASC\|DESC | 13. `status ASC, customerId ASC, paymentDate ASC`<br>14. `status ASC, customerId ASC, paymentDate DESC` |
| 8 | `currency`+`paymentMethod` | `currency`, `paymentMethod`, `paymentDate` ASC\|DESC | 15. `currency ASC, paymentMethod ASC, paymentDate ASC`<br>16. `currency ASC, paymentMethod ASC, paymentDate DESC` |
| 9 | `currency`+`customerId` | `currency`, `customerId`, `paymentDate` ASC\|DESC | 17. `currency ASC, customerId ASC, paymentDate ASC`<br>18. `currency ASC, customerId ASC, paymentDate DESC` |
| 10 | `paymentMethod`+`customerId` | `paymentMethod`, `customerId`, `paymentDate` ASC\|DESC | 19. `paymentMethod ASC, customerId ASC, paymentDate ASC`<br>20. `paymentMethod ASC, customerId ASC, paymentDate DESC` |
| 11 | `status`+`currency`+`paymentMethod` | `status`, `currency`, `paymentMethod`, `paymentDate` ASC\|DESC | 21. `status ASC, currency ASC, paymentMethod ASC, paymentDate ASC`<br>22. `status ASC, currency ASC, paymentMethod ASC, paymentDate DESC` |
| 12 | `status`+`currency`+`customerId` | `status`, `currency`, `customerId`, `paymentDate` ASC\|DESC | 23. `status ASC, currency ASC, customerId ASC, paymentDate ASC`<br>24. `status ASC, currency ASC, customerId ASC, paymentDate DESC` |
| 13 | `status`+`paymentMethod`+`customerId` | `status`, `paymentMethod`, `customerId`, `paymentDate` ASC\|DESC | 25. `status ASC, paymentMethod ASC, customerId ASC, paymentDate ASC`<br>26. `status ASC, paymentMethod ASC, customerId ASC, paymentDate DESC` |
| 14 | `currency`+`paymentMethod`+`customerId` | `currency`, `paymentMethod`, `customerId`, `paymentDate` ASC\|DESC | 27. `currency ASC, paymentMethod ASC, customerId ASC, paymentDate ASC`<br>28. `currency ASC, paymentMethod ASC, customerId ASC, paymentDate DESC` |
| 15 | all four | `status`, `currency`, `paymentMethod`, `customerId`, `paymentDate` ASC\|DESC | 29. `status ASC, currency ASC, paymentMethod ASC, customerId ASC, paymentDate ASC`<br>30. `status ASC, currency ASC, paymentMethod ASC, customerId ASC, paymentDate DESC` |

**Date-range compatibility:** `paymentDate >= startDate` / `<= endDate` use the same `paymentDate` orderBy field; no extra composite beyond the equality prefix + `paymentDate` direction.

**Non-search composites (still required):**

| Purpose | Composite |
|---------|-----------|
| Customer payment list (route 35) | `customerId ASC`, `paymentDate DESC` (covered by definition #8 above) |
| Rental payment list (route 36) | 31. `rentalId ASC, paymentDate DESC`<br>32. `rentalId ASC, paymentDate ASC` (for complete rental query support) |
| Balance paid scan (route 37) | 33. `customerId ASC, status ASC` |

Together, these constitute the **33 required payment composite index definitions** for Firestore.

#### Present vs missing in local `firestore.indexes.json`

| Item | Local JSON status | Requirement |
|------|-------------------|-------------|
| All 33 payment composite indexes in the matrix above | **Present** (added in Stage C4.1 to `indexes` in `firestore.indexes.json` and exercised live in Firestore Emulator via `tests/indexes.test.ts`) | Verified locally; cloud Firestore index deployment remains required before rollout |
| `payment_allocations.rentalChargeId` | **Active by default** (automatic single-field indexing is enabled; `fieldOverrides` array is empty `[]`) | Verified (no manual index needed) |
| `payment_allocations.paymentId` / `payment_reversals.paymentId` | **Active by default** (automatic single-field indexing) | Verified (no manual index needed) |
| `rental_charges` FIFO composites | **Present** (Stage C3 composite indexes in `indexes` array) | Verified |

> **Single-field vs composite index architecture:**
> - **Composite indexes:** The Firestore `indexes` array in `firestore.indexes.json` is strictly designed for multi-field composite indexes (queries combining multiple equality filters and range/order predicates). All 33 payment composite indexes must be added to this array during implementation.
> - **Single-field indexes:** Firestore automatically maintains single-field ASC and DESC indexes for every document field by default without requiring an entry in `indexes`. The `fieldOverrides` array is used exclusively when modifying or disabling single-field indexing. Inspection of `firestore.indexes.json` confirms that `fieldOverrides: []` is empty, meaning automatic single-field indexing for `rentalChargeId`, `paymentId`, and `customerId` is fully active and not excluded.
> - Adding the 33 composite definitions to `firestore.indexes.json` and verifying them against the Firestore Emulator is an **implementation requirement**. Non-production or production index deployment to live Firebase remains a **separate release gate** (§10). **Do not** claim production index availability prior to approved release deployment.

### 3.4 Pagination & sorting — locked

**Pagination decision:** Spring-compatible `page` / `size` / `sort` with Stage C3 `count()` + `startAfter` traversal (not a public cursor API).

| Aspect | Locked behaviour |
|--------|------------------|
| Params | `page` (default 0), `size` (default 20, max 100 via C3 `parsePage`), `sort` |
| Envelope | `content`, `pageNumber`, `pageSize`, `totalElements`, `totalPages`, `last` |
| `totalElements` | Firestore `count()` on the **same** filtered query (all equality + date predicates) |
| Page fetch | `orderBy` + `limit(size)` + traverse preceding pages with `startAfter` |
| Remaining deviation | Not SQL `OFFSET`; high `page` costs more reads |

**Sort decision (locked allow-list and case-insensitive direction parsing):**

| Item | Decision |
|------|----------|
| Java behaviour | `@PageableDefault(sort = "paymentDate", direction = DESC)`; Spring Data accepts **any** `Payment` entity property path in `sort` with no controller allow-list; Spring sort direction parsing is case-insensitive (accepts `ASC`, `asc`, `DESC`, `desc`). |
| Firebase supported sorts | **`paymentDate,ASC`** and **`paymentDate,DESC`** (default `paymentDate,DESC`). Direction parsing is **case-insensitive**: `paymentDate,asc` and `paymentDate,desc` are fully accepted and normalized via `rawDirection.toUpperCase()` (matching Stage C3 `parsePage`). Supported sort parameter values: `paymentDate`, `paymentDate,ASC`, `paymentDate,asc`, `paymentDate,DESC`, `paymentDate,desc`. |
| Ordering | `orderBy('paymentDate', dir)` then `orderBy(FieldPath.documentId(), dir)` as stable tie-breaker |
| Date range | Always compatible (inequality and orderBy share `paymentDate`) |
| Unsupported sorts | Any other field (e.g. `amount`, `createdAt`, `status`, nested `customer.*`) or unsupported direction (e.g. `sideways`) → **HTTP 400** validation error via `parsePage` allow-list. |
| Intentional Java deviation | Clients that rely on non-`paymentDate` Spring sorts will receive 400 on Firebase; impact: sort flexibility reduced to the Java default property, both directions preserved with case-insensitive casing |

Do **not** replace `page`/`size` with a cursor token in the public C4 API.

### 3.5 Timestamp fields & field-transformation budget (locked)

**Java evidence:** `Payment.createdAt` / `Payment.updatedAt` (`Instant createdAt = Instant.now()`, `Instant updatedAt = Instant.now()`), `PaymentAllocation.allocatedAt` (`Instant.now()` in field initializer and constructor), and `PaymentReversal.reversedAt` (`Instant.now()`). All of them are **application-generated** instants. None uses `@CreationTimestamp` or a DB default. `PaymentDto` exposes `createdAt` and `reversedAt` (the latter from `PaymentReversal`), and `PaymentAllocationDto` exposes `allocatedAt`. `updatedAt` is not exposed.

**Stage C3 evidence:** `RentalRepository.timestamp()` returns `Timestamp.now()` (`rental.repository.ts` line 239). `ChargeDocument.createdAt` / `updatedAt` are typed `Timestamp` (`domain/types.ts`). DTOs serialize them with `value.toDate().toISOString()` (`rental.service.ts` line 165). No `FieldValue.serverTimestamp()` appears anywhere in `backend-firebase/src`.

| Field | Collection | Firestore type | Generation | API exposure |
|-------|-----------|----------------|-----------|--------------|
| `createdAt` | `payments` | `Timestamp` | `Timestamp.now()` captured **once per transaction-callback attempt** (`now`) | `PaymentDto.createdAt` ISO-8601 string |
| `updatedAt` | `payments` | `Timestamp` | `now` on create; `now` of the reversal attempt on reversal | Not exposed (matches Java) |
| `allocatedAt` | `payment_allocations` | `Timestamp` | `now` of the create attempt (same value for every allocation in one payment) | `PaymentAllocationDto.allocatedAt` ISO-8601 string |
| `reversedAt` | `payment_reversals` | `Timestamp` | `now` of the reversal attempt | `PaymentDto.reversedAt` ISO-8601 string (null when not reversed) |
| `createdAt` | `payment_reversals` | `Timestamp` | Same value as `reversedAt` | Not exposed |
| `updatedAt` | `rental_charges` (Stage C3) | `Timestamp` | `now` of the attempt that rewrites the charge | Not exposed by payment DTOs |

**Rules:**
- **`FieldValue.serverTimestamp()` is prohibited** in payment create and reversal transactions. `FieldValue.increment()` is also prohibited (§3.1).
- As a result, the **field-transformation count of every payment transaction is 0**.
- Because `now` is recomputed on each callback replay (§4.4), a retried attempt simply uses a later instant. Nothing from a failed attempt is committed.
- **Budget separation:** The **500 document writes per Commit** limit and the **500 field transformations per document** limit are independent. Field transforms are applied *within* a document write and are **never** counted as extra document writes. If a future change ever introduced a server-timestamp transform, it would add 1 transform to the document that carries it, with no extra write. It would then have to be checked against the per-document transform limit, while the write count stays the same. With the current design, that check is trivially satisfied (0).

---

## 4. Transaction & Concurrency Design

### 4.1 Create Payment (atomic)

The entire payment-creation operation (payment document, all allocations, all charge updates) is **one atomic Firestore transaction**. No split-transaction approach is used.

**Workflow:**

1. **Start Firestore transaction.** Capture `now = Timestamp.now()` for this attempt (§3.5).
2. **Read phase (distinguishing AUTO_FIFO vs MANUAL). All reads precede any write:**
   - **Common reads:**
     a. Read `customers/{customerId}` (1 read). Abort with 404 if missing.
     b. Read `app_users/{authenticatedUser.id}` (1 read, **mandatory**). Supplies `fullName` for `recordedByUserName`. If missing → **401** `UNAUTHORIZED` "Authentication required", zero writes (§2.1).
     c. If `rentalId` provided: read `rentals/{rentalId}` (1 read). Abort with 404 if missing; abort with **400** if customer mismatch (Java `BusinessException`).
   - **MANUAL with absent/`null`/empty `manualAllocations`:** No charge or allocation reads. Go straight to step 5 and write only the `payments` document (§2.2 MANUAL rule 0).
   - **Mode-specific charge reads:**
     - **For AUTO_FIFO:** Query eligible `rental_charges` (by customer or rental, matching payment currency, status `UNPAID` or `PARTIALLY_PAID`, ordered by `dueDate ASC`). Charges are processed in order. For each processed charge, its allocation history is read (below) before the next one is considered, and reading stops once the remaining payment reaches zero. Charges after that point are not affected, and their history is not needed. Every read still happens before the first write. Read-volume bounds: §4.6.
     - **For MANUAL:** Read all individually referenced rental charge documents directly via `rental_charges/{rentalChargeId}` (point reads for all unique charges in `manualAllocations`). Abort with 404 if any referenced charge document is missing.
   - **Allocation and parent payment reads for affected charges:**
     - For every processed/referenced charge, query **all** existing `payment_allocations` for that charge. Never use a truncated result (§4.6).
     - Collect all distinct parent `paymentId` values from those allocations.
     - Read each parent `payments/{paymentId}` document within the transaction to check `status == CONFIRMED`.
     - Calculate the existing confirmed paid total (`paidSoFar`) per charge using BigInt `money-utils`.
3. **Validation and allocation computation phase (before any write):**
   - **For AUTO_FIFO:** Allocate the remaining payment sequentially to eligible charges in ascending due-date order until the payment is exhausted or the charges are satisfied. Charges with `unpaid <= 0` receive a status-correction write to `PAID` (§2.2 AUTO_FIFO rule 7a).
   - **For MANUAL:**
     - Validate that every referenced charge belongs to the customer (abort with 400 if mismatch).
     - Validate that every referenced charge matches payment currency (abort with 400 if mismatch).
     - Group manual allocation items by `rentalChargeId` and sum requested amounts using `addMoney`.
     - Validate that the combined requested amount for each charge $\le$ `(charge.amount - paidSoFar)` (abort with 400 if over-allocated).
     - Validate that total requested manual allocations across all items $\le$ `payment.amount` (abort with 400 if exceeded).
4. **Budget checks: write count, affected charges, read volume, Commit payload estimate (before any write):**
   - Projected writes = `1 (payment) + N_allocations + N_affected_charges` must be $\le 500$. `N_affected_charges` must be $\le 200$. Read-volume budgets per §4.6.
   - **Commit payload estimate. Included writes:** every document mutation in the atomic Commit:
     - 1 `payments` document.
     - $N_{\text{allocations}}$ `payment_allocations` documents.
     - $N_{\text{affected\_charges}}$ `rental_charges` documents (full document data as it will be written).
   - **Document data estimation approach:**
     - Measure each planned write's data from its in-memory representation, e.g. `Buffer.byteLength(JSON.stringify(docData), 'utf8')`, plus the UTF-8 byte length of its full document path.
     - **Conservative serialization & protocol overhead:** Stage C4.1 implements `COMMIT_OVERHEAD_MULTIPLIER = 1.5` and `COMMIT_PER_DOC_OVERHEAD_BYTES = 1024` (with `MAX_COMMIT_PAYLOAD_BYTES = 10 * 1024 * 1024` and `MAX_TRANSACTION_WRITES = 500`) in `src/payment/payment.types.ts` and `src/payment/payment.validation.ts`. These conservative starting values are verified in unit and Firestore Emulator tests; non-production cloud Firestore workload calibration remains **UNVERIFIED** and must never be lowered below measured reality.
     - **Explicit disclaimer on precision:** This is an application-level heuristic estimate, **not an exact measurement** of Firestore's serialized Commit request. The application cannot compute that exact size, and this specification does not claim it can.
     - **Safety rule for uncertain or oversized requests:** If the estimate exceeds 10 MiB, projected writes exceed 500, affected charges exceed 200, or a read budget (§4.6) is exceeded, the request is **rejected with HTTP 422 Unprocessable Entity** before any write. If a document cannot be measured reliably, treat the request as oversized and reject it the same way.
5. **Write phase (only after all reads, validations, and budget checks succeed):**
   - Write `payments/{uuid}` document (1 write) with `createdAt = updatedAt = now`.
   - For each allocation line item: write `payment_allocations/{uuid}` (1 write each, unique UUIDs, `allocatedAt = now`).
   - For each affected charge: recompute `paidAmount` (including new confirmed allocations) using `money-utils`, update `status` (`PAID` or `PARTIALLY_PAID`) and `updatedAt = now`, and write the updated `rental_charges` document (1 write each).
   - No `FieldValue` transforms (§3.5).
6. **Commit transaction.** Zero documents are written if any step in the read, validation, or budget phase fails. If the Commit itself fails at runtime, the SDK commits nothing (§4.6).

### 4.2 Transaction Budget Model

**Official Firestore transaction limits** (Firebase documentation):

| Limit | Value |
|-------|-------|
| Maximum document **writes** per transaction | **500** |
| Maximum document size | **1 MiB** |
| Maximum API request size (all writes in one Commit) | **10 MiB** |
| Maximum transaction execution time | **270 seconds** |
| Maximum transaction idle time | **60 seconds** |
| Maximum field transformations per document per Commit | **500** |

> There is **no documented hard limit on the number of reads** per transaction. Read volume is bounded by overall request size and latency, not a fixed count. The service must not reject a request solely for exceeding a "500-read" threshold.

**Application-level safeguards and platform limits (locked thresholds):**

Before committing, the transaction validates:
- **Maximum affected charges: 200** (create and reversal). Up to and including 200 affected charges is permitted, subject to the write and size budgets. More than 200 is rejected before any write.
- **Maximum document writes: 500** (official Firestore Commit limit). Projected writes $> 500$ are rejected before any write.
- **Maximum Commit payload: 10 MiB** (official Firestore request size limit). An estimated payload $> 10 \text{ MiB}$ is rejected before any write.
- **Read-volume budgets:** §4.6. Exceeding a budget is rejected before any write.
- **Field transformations:** 0 per document (§3.5). This is tracked separately from the write count. Transforms are never counted as document writes.
- **Commit payload estimation procedure:**
  - Covers every write in the Commit: `payments` (1), `payment_allocations` ($N_{\text{allocations}}$) and `rental_charges` ($N_{\text{affected\_charges}}$). For a reversal, the writes are `payments` (1), `payment_reversals` (1) and `rental_charges` ($N_{\text{affected\_charges}}$).
  - Approximates document bytes from the in-memory payloads (`Buffer.byteLength(JSON.stringify(doc))`) plus the document path bytes.
  - Adds a conservative overhead margin for protobuf/gRPC framing, field tags, path strings and the transaction token. The margin value is a Stage C4 implementation decision that needs workload calibration (§4.1 step 4).
  - This is an application heuristic safeguard, not an exact measurement of Firestore's wire serialization.
  - Any uncertain or oversized estimate aborts the transaction before any document is written.

If any safeguard is exceeded, the request is rejected with **HTTP 422 Unprocessable Entity** and zero documents are written (see §4.5).

**Create-Payment budget example:**

| Operation | Count |
|-----------|-------|
| Customer read | 1 |
| Audit-user read (`app_users/{authenticatedUser.id}`, mandatory, supplies `fullName` for `recordedByUserName`) | 1 |
| Rental read (optional) | 0–1 |
| Charge reads (AUTO_FIFO query results processed / MANUAL point reads) | N_charges_read |
| Existing allocation reads (complete history per processed charge) | Σ A_c (bounded by §4.6) |
| Parent payment reads (distinct parents of those allocations) | P (bounded by §4.6) |
| Write: `payments` document | 1 |
| Write: `payment_allocations` documents | N_allocations |
| Write: updated `rental_charges` documents (incl. AUTO_FIFO status-correction writes) | N_affected_charges (≤ 200) |
| **Total writes** | 1 + N_allocations + N_affected_charges (≤ 500) |
| Field transformations | **0** (no `increment`, no `serverTimestamp`; §3.5) |

**Reverse-Payment budget:**

| Operation | Count |
|-----------|-------|
| Payment read | 1 |
| Audit-user read (`app_users/{authenticatedUser.id}`, mandatory; §2.1) | 1 |
| Allocations of the reversed payment | N_own_allocations |
| Affected charge reads (`rental_charges/{id}`) | N_affected_charges (≤ 200) |
| Allocation-history reads per affected charge | Σ A_c (bounded by §4.6) |
| Parent payment reads (distinct) | P (bounded by §4.6) |
| Write: `payments` (status → `REVERSED`, `updatedAt`) | 1 |
| Write: `payment_reversals` document | 1 |
| Write: updated `rental_charges` (status recomputed) | N_affected_charges |
| **Total writes** | 2 + N_affected_charges (≤ 202 under the 200-charge cap, well within 500) |
| Field transformations | **0** (§3.5) |

### 4.3 Reverse Payment (atomic; all reads before writes & read-volume safeguards)

Firestore transactions require **all reads before any writes**. Do **not** write the payment status and then perform further transaction reads. Preserve Java’s final business result: allocation documents remain stored; confirmed paid totals exclude the reversed payment.

1. **Start Firestore transaction.** Capture `now = Timestamp.now()` for this attempt (§3.5).
2. **Read** `payments/{id}`. Abort if missing (404). Abort if `status == REVERSED` (`BusinessException` / 400).
3. **Read** `app_users/{authenticatedUser.id}` (mandatory). If missing → **401** `UNAUTHORIZED`, zero writes (§2.1).
4. **Read** all `payment_allocations` for that `paymentId`, deduplicate the affected `rentalChargeId` values, and enforce the 200 affected-charge cap (§4.2).
5. For each affected charge: **read** its **complete** `payment_allocations` history (`rentalChargeId == X`, never truncated; §4.6) and **read** each distinct parent `payments/{paymentId}` document to check whether `status == CONFIRMED`. Reading the actual parent payment documents is required. Denormalized status fields on allocation documents are prohibited. Also **read** each affected `rental_charges/{id}` document that will be updated.
6. **In memory**, compute confirmed allocation totals for each affected charge **as if** the payment being reversed were already `REVERSED` (exclude its allocation amounts from the confirmed sum; equivalently: treat only parents with `status == CONFIRMED` **other than** this paymentId, or treat this paymentId as non-confirmed). Derive the new charge `paidAmount` / `status`. Allocation documents themselves are **not** deleted or rewritten.
7. **Reversal read-volume safeguards** (full rules in §4.6):
   - Reading allocation histories and parent payments for heavily allocated charges risks high latency, the 270 s transaction execution limit, the 60 s idle limit, and contention. Firestore publishes **no numeric limit on reads per transaction**, and this specification invents none. Bounds are application budgets (§4.6).
   - **Never partially reverse a payment.**
   - **Never delete allocation history documents to reduce transaction size or read count.**
   - **Never split a reversal into multiple transactions or background jobs.**
   - **All reads remain strictly before any writes.**
   - If a read budget or the affected-charge cap is exceeded, which is detectable before writes, reject with **HTTP 422**, zero writes.
   - If the transaction fails at runtime (timeout, contention retries exhausted after the SDK default attempts, network or deadline errors), the SDK commits nothing. The error goes to the Stage C2 `errorMiddleware`, which returns **HTTP 500** `INTERNAL_SERVER_ERROR` with the standard `ErrorResponse` body (verified in `error.middleware.ts`; no 503 mapping exists in Stage C2/C3). All documents remain unchanged.
8. **Only after all reads, validations and budget checks complete — write phase:**
   - Write `payments/{id}` with `status = REVERSED`, `updatedAt = now`.
   - Write `payment_reversals/{uuid}` with `reason`, `reversedByUserId = authenticatedUser.id`, `reversedAt = createdAt = now`.
   - Write each affected `rental_charges` document with the updated `paidAmount` / `remainingAmount` / `status` and `updatedAt = now`.
9. **Commit.**

Java still saves `REVERSED` before recomputing charges inside one JPA `@Transactional` boundary; Firestore must achieve the **same end state** without interleaving writes and reads inside the Admin SDK transaction.

### 4.4 Concurrency Safeguards & Transaction Retries

- **All transaction reads occur before any writes:** Every candidate document (customer, audit user `app_users/{id}`, rental, charges, existing allocations, parent payments) is read before the first `.set()`, `.update()`, or `.create()` call.
- **Transaction callback replay behavior:** In `backend-firebase` (`package-lock.json` verifies installed `firebase-admin` version **14.5.0**; `package.json` specifies `^14.5.0`), all transactions invoke `firestore.runTransaction(updateFunction)` directly without a custom options object (`maxAttempts` is not explicitly set; defaults to 5 attempts per SDK specification).
- **Callback replay on contention:** On document contention or commit collision, the SDK automatically re-executes the entire `updateFunction` callback from the start.
- **Fresh snapshot evaluation:** Because all document reads occur *inside* the transaction callback, each retry fetches updated snapshots and evaluates charge balances against current committed state.
- **No external side effects in transaction callbacks:** Functions passed to `runTransaction` must remain purely idempotent. They must **not** trigger external side effects (e.g. sending emails, invoking non-transactional webhooks, or calling external APIs) within the retry loop. Any post-commit logging or notifications must execute only *after* `runTransaction` successfully resolves.
- **Random UUID generation across retries:** Allocation document IDs use random UUIDs. If a callback execution fails before commit, its generated IDs and local write buffers are simply discarded by the SDK without leaving orphaned records.
- **Server-generated IDs:** Payment UUIDs are server-generated; there are no client-provided payment IDs or public idempotency keys.

### 4.5 Oversized payment & large-history reversal rejection policy (atomic; no multi-record bypass)

Payment creation and payment reversal both remain **strictly atomic operations** committed in a single Firestore transaction.

When projected writes, the Commit payload estimate, the affected-charge count, or a read-volume budget (§4.6) is exceeded:

| Rule | Requirement |
|------|-------------|
| Response (predictable budget exceeded, create **or** reversal) | **HTTP 422 Unprocessable Entity** with a clear error; **zero** writes committed |
| Response (runtime transaction failure, create **or** reversal) | SDK commits nothing; Stage C2 `errorMiddleware` returns **HTTP 500** `INTERNAL_SERVER_ERROR` (standard `ErrorResponse`); all documents unchanged |
| Atomicity | Do not partially persist the payment, reversal, or any subset of allocations or charge updates |
| History preservation | **Never** delete allocation history documents to reduce transaction size or read counts |
| Anti-pattern (forbidden) | Do **not** represent one real-world payment as multiple separate `payments` documents, and do **not** split a payment or reversal across multiple transactions to stay under Firestore limits |
| Allowed operator remedies | Narrow scope with `rentalId`, use `MANUAL` with fewer charges, or reduce the recorded amount so one atomic payment fits the budget — only when that matches the real business event |
| Business implication | A payment or reversal that cannot be atomically processed within practical platform boundaries cannot be partially committed. Splitting for limit evasion would break audit fidelity (one bank transfer ≠ many payment IDs), distort balance/`totalPaid`, and diverge from Java’s single `@Transactional` semantics |

### 4.6 Transaction read-volume safeguards (create AUTO_FIFO, create MANUAL, reversal)

Firestore documents **no fixed per-transaction read limit**. Reads are bounded in practice by the 270 s execution limit, the 60 s idle limit, latency, and contention. The application therefore defines **measurable budgets**:

| Quantity | Symbol | Applies to | Threshold (Stage C4.1 implemented in `payment.types.ts`) |
|----------|--------|-----------|-----------|
| Affected charges | `C` | Create (AUTO_FIFO & MANUAL), reversal | `MAX_AFFECTED_CHARGES = 200` (locked, §4.2) |
| Existing allocation documents read for one charge | `A_c` | Every charge whose history is read | `MAX_ALLOCATIONS_PER_CHARGE = 200` (checked via `limit(MAX_ALLOCATIONS_PER_CHARGE + 1)` non-truncating overrun detection -> HTTP `422`) |
| Distinct parent payment documents read | `P` | Create, reversal | `MAX_PARENT_PAYMENTS_READ = 500` |
| Total allocation-history documents read during creation | `Σ A_c` (create) | AUTO_FIFO & MANUAL | `MAX_ALLOCATION_HISTORY_READS_CREATE = 1000` |
| Total allocation-history documents read during reversal | `Σ A_c` (reverse) + `N_own_allocations` | Reversal | `MAX_ALLOCATION_HISTORY_READS_REVERSE = 1000` |
| Total transaction writes | `W` | Create, reversal | `MAX_TRANSACTION_WRITES = 500` |
| Estimated commit payload size | `bytes` | Create, reversal | `MAX_COMMIT_PAYLOAD_BYTES = 10 * 1024 * 1024` (`COMMIT_OVERHEAD_MULTIPLIER = 1.5`, `COMMIT_PER_DOC_OVERHEAD_BYTES = 1024`) |

These named constants are enforced atomically before any transaction write and covered by unit and Firestore Emulator integration tests (returning HTTP `422 UnprocessableEntityError` with zero persisted writes on breach). Measuring real transaction latency under load against the 270 s / 60 s cloud Firestore transaction limits remains a pre-production validation gate (§10).

**Mandatory safety rules (all three operations):**
1. **No silent truncation.** A query used to compute confirmed allocation totals must never be cut off by a `limit` that is then treated as complete. To detect an exceeded budget, query with `limit(budget + 1)`. If `budget + 1` documents come back, the budget is exceeded → abort. A truncated result set is never used.
2. **No incomplete history.** A balance, `paidSoFar`, charge `status`, or `paidAmount` is never computed from partial allocation history or from a missing parent payment. The denormalized `rental_charges.paidAmount` is never used as a substitute.
3. **Predictable overrun → reject before writes.** If any budget, the 200-charge cap, the 500-write limit, or the 10 MiB estimate is exceeded, abort with **HTTP 422** and zero writes.
4. **AUTO_FIFO completeness:** If the 200-charge cap or a read budget is reached while `remainingToAllocate > 0` **and** more eligible charges exist, abort with 422. Do **not** stop early and leave the rest unallocated, because Java would have continued allocating.
5. **Runtime failure → unchanged state.** Timeouts, exhausted contention retries, and network errors abort the transaction. Nothing is committed, and the response is **HTTP 500** (§4.5).
6. **No partial operations.** No partial payment, allocation set, charge update set, or reversal.
7. **No history deletion** to reduce read volume.
8. **No splitting** a payment or reversal across transactions.
9. **Chunked queries:** If an `in` query is chunked (Stage C3 `paidAmountsForCharges` uses 30-ID chunks outside transactions), every chunk must be read in full inside the transaction, and all chunks count toward the same budgets.

---

## 5. Java Compatibility Requirements

| Aspect | Java Contract | Firestore-Side Mapping |
|--------|---------------|------------------------|
| **JSON field names** | CamelCase (e.g., `paymentDate`, `paymentMethod`) | Preserve exact field names in API request/response payloads. |
| **Date format / `paymentDate` storage** | `LocalDate` → `"yyyy-MM-dd"` in JSON | Canonical Firestore field: **string** `"yyyy-MM-dd"` only (preserves LocalDate semantics; avoids timezone ambiguity). Do **not** store `paymentDate` as a Timestamp. |
| **Monetary values (API wire)** | Plain `BigDecimal` DTOs; Jackson default → JSON **number** (§1.7) | API responses return JSON **numbers** via `moneyToJson()` (§1.7, §3.1). Request bodies accept JSON numbers (validated on their parsed value, Rule N) or numeric strings (validated lexically, Rule S), with at most 2 fractional digits and a minimum of 0.01 (§2.3). The lexical spelling of JSON numbers is not preserved by `JSON.parse`. Live Java HTTP body still **NOT CAPTURED**. |
| **Monetary values (Firestore)** | DB `precision=14,scale=2` | Store canonical **scale-2 decimal strings**. Input scale > 2 policy is **DECIDED (DOCUMENTED COMPATIBILITY DEVIATION)**: reject with HTTP 400 (§2.3). |
| **Currency** | `@Pattern("^(RON|EUR|USD)$")` before service normalize | Accept only exact uppercase codes on the API; reject lowercase / padded with 400. |
| **Search param `method`** | `@RequestParam PaymentMethod method` | The query parameter name is `method`, not `paymentMethod`. |
| **Pagination params** | Spring `Pageable` → `page` (0-indexed), `size`, `sort` | Use these exact Spring parameter names. Default: `page=0`, `size=20`, `sort=paymentDate,DESC`. Direction parsing is case-insensitive (accepts `ASC`, `asc`, `DESC`, `desc`). |
| **PageResponse shape** | `content`, `pageNumber`, `pageSize`, `totalElements`, `totalPages`, `last` | Preserve this exact envelope via Stage C3 count + cursor traversal. Remaining deviation: high-page read cost (not SQL `OFFSET`). |
| **Error body** | `ErrorResponse`: `timestamp`, `status`, `error`, `message`, `path`, optional `validationErrors` | Mirror Java `ErrorResponse` fields (not a generic `code`/`details` inventing). |
| **HTTP status codes** | 201 (create), 200 (others), 404 (`ResourceNotFoundException`), 400 (`BusinessException` default / validation) | Payment `BusinessException` call sites → **400**. Firebase-only **422** (budget/size safeguards, §4.5/§4.6) is an application safeguard, not a verified Java payment status. Runtime transaction failures → 500 via Stage C2 `errorMiddleware`. |
| **Authentication** | `SecurityConfig`: `.anyRequest().authenticated()`; no `@PreAuthorize`/role checks on `PaymentController`. Authenticated user recorded for audit only. | Payment router applies **only** Stage C2 `createAuthMiddleware`; **`ownerMiddleware` is prohibited**; authenticated non-owner users (e.g. `ROLE_CUSTOMER`) reach handlers. All Stage C2 401 rejections are preserved (§1.8). |
| **Missing audit-user profile** | Service: `ResourceNotFoundException("User")` → 404 | **401** `UNAUTHORIZED` "Authentication required" at both middleware and transaction layers. **DOCUMENTED COMPATIBILITY DEVIATION** for the concurrent-deletion case (§2.1). |
| **MANUAL with absent/`null`/empty `manualAllocations`** | Early return → 201, zero allocations | Same (Java parity, §2.2 MANUAL rule 0). |
| **`allocationMode` dispatch** | `"MANUAL".equalsIgnoreCase(...)`; anything else → AUTO_FIFO | Same (§1.1). |
| **Timestamps** | Application `Instant.now()` | Firestore `Timestamp` from `Timestamp.now()`; ISO-8601 strings in DTOs; no `serverTimestamp` (§3.5). |
| **Enum values** | `CONFIRMED`, `REVERSED`, `CASH`, `BANK_TRANSFER` | Preserve exact uppercase string values in JSON (`PaymentMethod` contains only `CASH` and `BANK_TRANSFER`). |
| **Rental Charge ID format** | Entity `UUID` (`RentalCharge.id`, `RentalChargeDto.id`, `ManualAllocationItem.rentalChargeId`) | Document ID string formatted as `"${rentalId}_${chargeSequence}"` (e.g. `"r456f789-1234-56d7-b890-123456789abc_1"`). **DECIDED (DOCUMENTED COMPATIBILITY DEVIATION)**: Matches Stage C3 Firestore document keys directly; direct point lookup `rental_charges/{rentalChargeId}`; avoids UUID translation overhead. |

---

## 6. Testing Specification

### 6.1 Unit Tests

| Test Case | Description |
|-----------|-------------|
| `createPayment_autoFifo_success` | AUTO_FIFO fully allocates across multiple UNPAID charges; verifies allocation amounts, charge statuses, and remaining balances. |
| `createPayment_manual_success` | Manual allocation with exact amounts; checks all validations and final state. |
| `createPayment_manual_emptyOrNullAllocations` | `allocationMode == "MANUAL"` with absent, `null`, or `[]` `manualAllocations` succeeds (**201**) with zero allocations (§2.2 MANUAL rule 0). |
| `createPayment_decimalInputValidation` | JSON number `250.50` and numeric string `"250.50"` accepted; number `1.000` accepted (Rule N, parsed as `1`); string `"1.000"` rejected with **400** (Rule S, 3 written fractional digits); `1.005`, `"1.005"`, `0.005`, `"0.005"`, `0`, `"0.00"` rejected with **400** (§2.3). |
| `createPayment_manual_overAllocation` | Total manual allocations > payment amount → **400** (Java `BusinessException`). |
| `createPayment_currencyMismatch` | Charge currency ≠ payment currency → **400**. |
| `createPayment_chargeWrongCustomer` | Manual allocation targets a charge belonging to another customer → **400**. |
| `createPayment_exceedsUnpaidBalance` | Manual allocation exceeds the charge's unpaid balance → **400**. |
| `reversePayment_success` | Reverses CONFIRMED payment; verifies `status == REVERSED`, reversal document exists, charge statuses recomputed. |
| `reversePayment_alreadyReversed` | Attempt to reverse REVERSED payment → **400**. |
| `balanceSummary_excludesReversed` | Reversed payment is excluded from `totalPaid`; billed totals are correct. |
| `searchPayments_filtersAndSorting` | Applies `status`, `currency`, `method`, `customerId`, `startDate`, `endDate`; verifies pagination and case-insensitive sort direction (`ASC`/`asc`/`DESC`/`desc`). |
| `authorization_missingToken` | No JWT → 401. |
| `authorization_invalidToken` | Malformed JWT → 401. |
| `authorization_nonOwnerRoleCustomerAllowed` | Authenticated `ROLE_CUSTOMER` user is permitted across all 7 payment handlers and never rejected with 403 (§1.8). |
| `authorization_missingUserProfile` | Valid JWT whose `app_users/{userId}` document is missing returns **401** `UNAUTHORIZED` with zero writes (§2.1). |

### 6.2 Firestore Emulator Integration Tests — seven-route coverage

Authentication is enforced by the **Express JWT middleware** (`createAuthMiddleware` only; `ownerMiddleware` prohibited), not by Firestore Security Rules (Admin SDK bypass). Every case below must call the **actual Express routes** under `/api/v1/payments` with the Stage C2 JWT middleware applied. Do not assert via direct Firestore Admin reads alone as the primary success path; use HTTP responses, then optionally confirm persistence.

**Standard JWT Matrix (required for all seven routes 31–37):**
- (a) Missing `Authorization` header / empty Bearer token → **401** `UNAUTHORIZED`.
- (b) Malformed, invalid-signature, expired, or revoked token (`authVersion` mismatch or `iat <= tokenIssuedBefore`) → **401** `UNAUTHORIZED`.
- (c) Valid JWT whose `app_users/{userId}` profile document is missing (both at middleware entry and on concurrent deletion before/during the transaction read phase) → **401** `UNAUTHORIZED` with zero writes.
- (d) Valid `ROLE_OWNER` token → handler reached.
- (e) Valid **`ROLE_CUSTOMER` token → handler reached for all seven routes (31–37), never rejected with 403** (§1.8).

| Route | Method / path | Required integration cases |
|-------|---------------|----------------------------|
| **31** | `POST /api/v1/payments` | AUTO_FIFO success; MANUAL success; MANUAL with absent/`null`/`[]` `manualAllocations` → **201** (zero allocations); accept JSON number `250.50`, number `1.000` (Rule N), and string `"250.50"`; reject string `"1.000"` (Rule S) → **400**; over-allocation / wrong-customer / currency-mismatch / exceeds-unpaid → **400**; currency lowercase/padded → 400; amount `0.005` or string `"0.005"` (below minimum / >2 decimals) → 400; scale >2 (`1.005`, `"1.005"`) → 400; non-numeric string / `0` / `"0.00"` → 400; oversized projected writes / >200 charges / read-volume budget exceeded → **422** (Firebase safeguard) with **zero** writes; complete JWT matrix (incl. `ROLE_CUSTOMER` → **201**) |
| **32** | `POST /api/v1/payments/{id}/reverse` | Reverse CONFIRMED → 200, reversal doc exists, allocations retained, charge `paidAmount`/`status` exclude reversed payment; already reversed → **400**; missing id → 404; transaction reads `app_users/{authenticatedUser.id}` and **all reads before writes**; predictable >200 charges or read-volume budget exceeded → **422** with zero writes; large history handled atomically without deleting allocations; complete JWT matrix (incl. `ROLE_CUSTOMER` → **200**) |
| **33** | `GET /api/v1/payments/{id}` | Existing payment with allocations (+ reversal fields when reversed); **missing payment lookup → 404**; complete JWT matrix (incl. `ROLE_CUSTOMER` → **200**) |
| **34** | `GET /api/v1/payments` | Filter/sort by `status`, `currency`, `method`, `customerId`, `startDate`, `endDate`; sort `paymentDate,DESC`, `paymentDate,desc`, `paymentDate,ASC`, `paymentDate,asc` (case-insensitive direction); default `paymentDate,DESC`; unsupported sort field/direction → 400; `page`/`size` envelope fields; multi-page (`> 25` rows) `totalElements`/`last`; complete JWT matrix (incl. `ROLE_CUSTOMER` → **200**) |
| **35** | `GET /api/v1/payments/customer/{customerId}` | **Customer payment listing** ordered by `paymentDate` DESC; empty list for unknown/no-payments customer; complete JWT matrix (incl. `ROLE_CUSTOMER` → **200**) |
| **36** | `GET /api/v1/payments/rental/{rentalId}` | **Rental payment listing** ordered by `paymentDate` DESC; empty list when none; complete JWT matrix (incl. `ROLE_CUSTOMER` → **200**) |
| **37** | `GET /api/v1/payments/balance-summary/{customerId}` | **Balance summary** per `RON`/`EUR`/`USD`; excludes `REVERSED` from `totalPaid`; missing customer → 404; complete JWT matrix (incl. `ROLE_CUSTOMER` → **200**) |

**Cross-cutting (must use routes above, not Admin-only helpers):**

1. **Atomicity**: failed create/reverse (including validation failure, 422 budget safeguard, missing `app_users/{id}`, or runtime failure) leaves no partial payment, allocation, reversal, or charge mutation.
2. **Concurrent operations**: two parallel creates allocating the same charge; assert consistent unpaid balances (one wins / retry), no double-credit.
3. **Reversal behaviour**: confirmed-sum exclusion after status flip; allocations not deleted.
4. **Authorization**: missing / malformed / invalid / expired / revoked token → 401; valid JWT with missing `app_users/{userId}` document → 401 (zero writes); valid `ROLE_OWNER` and valid non-owner `ROLE_CUSTOMER` tokens → handler reached for all seven routes (never 403).

All emulator tests must pass **three consecutive times from a clean emulator state**.

---

## 7. Implementation File Structure (Stage C4.1)

```text
backend-firebase/
├─ firestore.indexes.json
├─ src/
│  ├─ app.ts
│  ├─ domain/
│  │  └─ types.ts
│  ├─ shared/
│  │  ├─ errors.ts
│  │  └─ money.ts
│  ├─ rental/
│  │  └─ rental.repository.ts
│  ├─ controllers/
│  │  └─ payment.controller.ts
│  ├─ routes/
│  │  └─ payment.routes.ts
│  └─ payment/
│     ├─ payment.types.ts
│     ├─ payment.validation.ts
│     ├─ payment.repository.ts
│     └─ payment.service.ts
└─ tests/
   ├─ indexes.test.ts
   ├─ payment.unit.test.ts
   ├─ payment.test.ts
   └─ run-tests.ts
```

---

## 8. Dependencies on Prior Stages

- **Stage C1** – Firestore initialization and project configuration.
- **Stage C2** – JWT authentication middleware and Express auth guard.
- **Stage C3** – canonical decimal-string `money-utils` (BigInt arithmetic), Spring-compatible page envelope via count + cursor traversal helpers, common error-response format (`ErrorResponse`), and index conventions.

---

## 9. Known Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Large allocation batch / reversal write & charge cap** – create or reversal exceeds 200 affected charges, 500 writes, or 10 MiB payload estimate | Cannot complete atomically under Firestore limits | Reject predictably before writes with **HTTP 422** and zero writes (§4.2, §4.5). Up to and including 200 affected charges is permitted (subject to write/payload/read budgets). Never split one payment or reversal across multiple transactions or records. Operator may narrow `rentalId` / MANUAL scope only when that matches the real event. |
| **Input scale > 2 & `JSON.parse` numeric token coercion** – Java DTO accepts e.g. `1.005`; `JSON.parse` coerces `1.000` → `1` | Intentional Java↔Firebase compatibility deviation and documented number-vs-string asymmetry | **DECIDED (DOCUMENTED COMPATIBILITY DEVIATION)**: Apply Rule N (parsed number value via `String(value)`) and Rule S (lexical check on trimmed strings) enforcing max 2 fractional digits and minimum `0.01`; reject `1.005`, `"1.005"`, `"1.000"`, `0.005` with **400** (§2.3). Documented asymmetry: JSON number `1.000` becomes `1` under `express.json()`/`JSON.parse` and passes Rule N; string `"1.000"` fails Rule S. |
| **Transaction read-volume budgets** – unbounded allocation history per charge (`A_c`, `P`, `Σ A_c`) | Latency, contention, or 270 s / 60 s transaction timeout during create or reversal | **STAGE C4.1 IMPLEMENTED (CLOUD WORKLOAD BENCHMARK REMAINING)**: Stage C4.1 enforces `MAX_ALLOCATIONS_PER_CHARGE = 200`, `MAX_PARENT_PAYMENTS_READ = 500`, `MAX_ALLOCATION_HISTORY_READS_CREATE = 1000`, and `MAX_ALLOCATION_HISTORY_READS_REVERSE = 1000` in `src/payment/payment.types.ts` with `limit(budget + 1)` non-truncating detection (HTTP 422 before writes; runtime failure → 500, zero writes). Measuring real cloud Firestore latency under workload volume (§4.6) remains a pre-release gate. |
| **Commit payload estimation margin** – application JSON size vs binary gRPC protobuf Commit size | Under-estimating overhead could hit Firestore 10 MiB Commit error at runtime; exact protobuf size not computed in app | **STAGE C4.1 IMPLEMENTED (CLOUD CALIBRATION REMAINING)**: Stage C4.1 measures JSON doc + path bytes and applies `COMMIT_OVERHEAD_MULTIPLIER = 1.5` and `COMMIT_PER_DOC_OVERHEAD_BYTES = 1024` against `MAX_COMMIT_PAYLOAD_BYTES = 10 * 1024 * 1024` (§4.1 step 4, §4.2). Non-production cloud Firestore workload calibration remains **UNVERIFIED**. Uncertain/unmeasurable payloads are rejected with 422 before writes. |
| **API BigDecimal wire format** – default Jackson numbers; live HTTP not captured | Clients may assume strings | Return JSON numbers on responses via `moneyToJson()` (§1.7); confirm with MockMvc/live capture before locking client contracts. |
| **Search index completeness** – 16 Java equality subsets | Missing composites in target Firebase project | **LOCAL JSON ADDED & EMULATOR-VERIFIED**: All 33 `payments` composite indexes (§3.3) are in `backend-firebase/firestore.indexes.json` and tested live against the Firestore Emulator (`tests/indexes.test.ts`). Hybrid in-memory filtering is prohibited. Cloud Firestore index deployment remains a release gate (**UNVERIFIED**). |
| **Transaction retry policy** | Contention on shared charges under concurrent payments | **MITIGATED & VERIFIED**: Verified `firebase-admin 14.5.0` default `runTransaction` callback replay semantics (default 5 attempts, no custom `maxAttempts`); all reads execute inside callback; random UUID allocation IDs prevent persistent collisions; external side effects strictly prohibited inside callback (§4.4). |
| **Null audit-user fallback** | Source path exists in Java | **DECIDED (INTENTIONAL OMISSION)**: Stage C2 JWT middleware guarantees authenticated user ID; arbitrary first-user fallback omitted (§2.1). |
| **Missing audit-user profile (`app_users/{id}`)** | Concurrent deletion of `app_users` doc between middleware and transaction | **DECIDED (DOCUMENTED COMPATIBILITY DEVIATION)**: Return **401** `UNAUTHORIZED` ("Authentication required") at both middleware (`users.findById`) and transaction read phase instead of Java's service-level 404 (§2.1). Zero writes committed. |
| **Role authorization on payment routes** | Risk of accidentally copying `ownerMiddleware` from Stage C3 rental routes | **VERIFIED & LOCKED**: Payment router applies Stage C2 `createAuthMiddleware` only; `ownerMiddleware` is prohibited; valid `ROLE_CUSTOMER` tokens reach all 7 handlers without 403 (§1.8). |
| **High page numbers** – Stage C3-style traversal | Read cost grows with `page` | Preserve Spring page contract; document cost deviation vs SQL `OFFSET`. |
| **Rental Charge ID representation** – Java uses relational `UUID`; Stage C3 uses `${rentalId}_${sequence}` | Divergence from Java `UUID` type contract in DTOs and API payloads | **DECIDED (DOCUMENTED COMPATIBILITY DEVIATION)**: In Stage C4 Firebase, `rentalChargeId` in DTOs, request payloads, and `payment_allocations` documents is a string matching the Stage C3 document ID format `"${rentalId}_${chargeSequence}"` (§1.1, §1.4, §4.1, §5). Enables single-read point lookups without secondary index tables. |

---

## 10. Acceptance Criteria for Stage C4

- Endpoint matrix matches verified Java controller method signatures, DTO fields, HTTP status codes, and query parameter names.
- All seven payment routes enforce Stage C2 authentication (`createAuthMiddleware`) only; `ownerMiddleware` and role-based 403 restrictions are prohibited; authenticated non-owner (`ROLE_CUSTOMER`) users reach all seven handlers (§1.8).
- Create and reversal transactions perform a mandatory point-read of `app_users/{authenticatedUser.id}` before any writes, returning **401** `UNAUTHORIZED` ("Authentication required") if missing (§2.1, §4.1, §4.3).
- Business rules reproduce every validation check and allocation algorithm in `PaymentService.java`, including `allocationMode == "MANUAL"` with absent/`null`/empty `manualAllocations` succeeding with HTTP 201 and zero allocations (§2.2 MANUAL rule 0).
- Firestore schema uses decimal strings for all monetary fields; no integer-cent fields exist.
- Request decimal validation follows Rule N (parsed number via `String(value)`) and Rule S (lexical check on trimmed strings) without claiming `JSON.parse` preserves the lexical spelling of JSON numeric tokens; non-rounding strict validation rejects >2 fractional digits (`1.005`, `"1.005"`, `"1.000"`) and values `< 0.01` with 400 (§2.3).
- Timestamp fields (`createdAt`, `updatedAt`, `allocatedAt`, `reversedAt`) use application-generated `Timestamp.now()` once per transaction attempt with `FieldValue.serverTimestamp()` prohibited, keeping field-transformation counts at **0** and separate from the 500-write limit (§3.5).
- Payment creation, allocations, and charge updates are atomic in one transaction.
- Reversal Firestore workflow performs **all reads before writes** (§4.3) while matching Java end state (allocations retained; confirmed totals exclude reversed payment).
- Transaction budget model is correct and appears exactly once, with read-volume budgets forbidding silent query truncation (`limit(budget + 1)`) and forbidding partial history usage (§4.2, §4.6).
- No split-transaction, allocation deletion, or multi-payment bypass exists for oversized creates or large-history reversals (§4.5, §4.6).
- Search supports every Java optional filter combination via complete composite indexes (§3.3); hybrid in-memory filtering is prohibited; production index deploy remains an independent release gate.
- `paymentDate` uses a single canonical `"yyyy-MM-dd"` string representation in Firestore.
- Test matrix covers all seven routes (Express + JWT, including valid `ROLE_CUSTOMER` non-owner access and missing `app_users/{id}` → 401) and major financial business rules.
- Authorization tests target Express middleware, not Firestore Security Rules.
- Documented decisions and intentional deviations (scale > 2 rejection policy with Rule N/Rule S, omission of arbitrary first-user fallback, 401 on missing `app_users/{id}` in transaction, `rentalChargeId` Stage C3 string format, 33 composite index definitions, non-default sort restriction to `paymentDate` with case-insensitive direction) and Stage C4.1 safeguard/index/emulator gates are implemented and locally verified, while remaining cloud/release gates (**cloud Firestore workload latency calibration of the Commit payload overhead margin and read-volume budget constants**, **live BigDecimal HTTP capture**, and **cloud Firestore index/app deployment**) remain open before production rollout.
- Stage C4.1 implemented all 7 payment routes (`POST /api/v1/payments`, `POST /api/v1/payments/{paymentId}/reverse`, `GET /api/v1/payments/{paymentId}`, `GET /api/v1/payments`, `GET /api/v1/payments/customer/{customerId}`, `GET /api/v1/payments/rental/{rentalId}`, `GET /api/v1/payments/balance-summary/{customerId}`), updated Stage C3 `RentalRepository.paidAmountsForCharges` to exclude `REVERSED` payments, and added all 33 `payments` composite indexes to `backend-firebase/firestore.indexes.json`.
- No implementation code was changed in Java (`backend/`), Flutter (`mobile/`), React (`web/`), Neon PostgreSQL, or production Firebase.
- Verification results in `backend-firebase`: `npm run typecheck` (`tsc --noEmit`) passed cleanly, `npm run build` passed, `npm audit --omit=dev` found `0` vulnerabilities, and 3 consecutive full Firestore Emulator runs (`npx firebase emulators:exec --project bike-rental-test --only firestore "node dist/tests/run-tests.js"`) exited with code `0` (`26` passed, `0` failed, `0` skipped across 12 test suites per run).
- Remaining pre-production gates: deploy `firestore.indexes.json` to the target Firebase project, measure real cloud Firestore transaction latencies against the 270 s / 60 s limits under expected workload volume, and complete final release sign-off.

---

*Prepared by Antigravity (AGY) – Advanced Agentic Coding*

---

## Appendix A – Example JSON Payloads

> **Note:** Request examples below may use numeric strings for amounts (Jackson typically deserializes either). Response `amount` / `allocatedAmount` are expected to be JSON **numbers** per §1.7 unless a live capture proves otherwise.

### 31. Create Payment – AUTO_FIFO
```json
POST /api/v1/payments
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "customerId": "c123e456-7890-12d3-a456-426614174000",
  "paymentDate": "2024-07-01",
  "amount": 250.00,
  "currency": "EUR",
  "paymentMethod": "CASH",
  "allocationMode": "AUTO_FIFO"
}
```

### 31. Create Payment – MANUAL
```json
POST /api/v1/payments
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "customerId": "c123e456-7890-12d3-a456-426614174000",
  "paymentDate": "2024-07-01",
  "amount": 250.00,
  "currency": "EUR",
  "paymentMethod": "BANK_TRANSFER",
  "allocationMode": "MANUAL",
  "manualAllocations": [
    { "rentalChargeId": "r456f789-1234-56d7-b890-123456789abc_1", "amount": 150.00 },
    { "rentalChargeId": "r456f789-1234-56d7-b890-123456789abc_2", "amount": 100.00 }
  ]
}
```

### 32. Reverse Payment
```json
POST /api/v1/payments/9f8e7d6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f/reverse
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "reason": "Customer requested cancellation of duplicate payment"
}
```

### 33. Get Payment
```
GET /api/v1/payments/9f8e7d6c-5b4a-3c2d-1e0f-9a8b7c6d5e4f
Authorization: Bearer <jwt>
```

### 34. Search Payments
```
GET /api/v1/payments?status=CONFIRMED&currency=EUR&method=CASH&customerId=c123e456-7890-12d3-a456-426614174000&startDate=2024-01-01&endDate=2024-12-31&page=0&size=20&sort=paymentDate,desc
Authorization: Bearer <jwt>
```

### 35. Payments for Customer
```
GET /api/v1/payments/customer/c123e456-7890-12d3-a456-426614174000
Authorization: Bearer <jwt>
```

### 36. Payments for Rental
```
GET /api/v1/payments/rental/r456f789-1234-56d7-b890-123456789abc
Authorization: Bearer <jwt>
```

### 37. Customer Balance Summary
```
GET /api/v1/payments/balance-summary/c123e456-7890-12d3-a456-426614174000
Authorization: Bearer <jwt>
```

---

*End of document*

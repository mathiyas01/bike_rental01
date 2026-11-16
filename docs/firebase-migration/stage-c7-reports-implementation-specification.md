# Stage C7.0 – Reports Contract Audit & Implementation Specification

**Status:** Stage C7.0.1 Approved Clarification (Ready for Stage C7.1 Implementation — Documentation Only in This Stage)  
**Target Codebase:** `backend-firebase/`  
**Authoritative Reference:** `backend/` (Java Spring Boot `ro.bikerental.modules.report`)  
**Scope Exclusion:** Documentation only (`docs/firebase-migration/`); no changes to `backend/`, `backend-firebase/`, `mobile/`, `web/`, Neon PostgreSQL, or production Firebase.

---

## 1. Executive Summary

This document defines the verified, clarified Firebase migration contract and implementation specification for **Stage C7 (Reports & Analytics)** based on a direct audit of the authoritative Java Spring Boot backend (`backend/`), existing `backend-firebase/` foundations, `firestore.indexes.json`, and Flutter/React client consumers. Stage **C7.0.1** resolves all three open questions prior to Stage C7.1 implementation.

### Key Decisions & Clarifications

1. **Four Endpoints Confirmed (Routes 58–61):**  
   Direct inspection of `ReportController.java` (`@RequestMapping("/api/v1/reports")`, lines 16–52) confirms **4 read-only HTTP GET endpoints** (note that the initial Stage C7.0 prompt's 3-item summary omitted `/fleet-utilization`, which is present in `ReportController.java` lines 33–37 and listed as Route 59 in `api-compatibility-matrix.md` lines 128–131):
   - **Route 58:** `GET /api/v1/reports/dashboard` -> `DashboardKpiDto`
   - **Route 59:** `GET /api/v1/reports/fleet-utilization` -> `FleetUtilizationDto`
   - **Route 60:** `GET /api/v1/reports/date-range?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` -> `DateRangeReportDto`
   - **Route 61:** `GET /api/v1/reports/bike-roi/{bikeId}` -> `BikeRoiDto`
2. **Read-Only Aggregation Module (Zero Mutations / Zero Transactions):**  
   All four `ReportService` methods are annotated `@Transactional(readOnly = true)`. Neither PostgreSQL nor Firestore requires write transactions; Firestore can execute independent collection queries concurrently via `Promise.all`.
3. **Authentication Parity Without `ownerMiddleware`:**  
   `ReportController.java` has no `@PreAuthorize` annotations, and `SecurityConfig.java` (line 100) restricts routes only via `.anyRequest().authenticated()`. All 4 routes must use `createAuthMiddleware` (no `ownerMiddleware`).
4. **Resolved Decision 1 – Bike ROI Revenue Retained With Literal Java Parity (Route 61):**  
   In `ReportService.java` line 120, `getBikeRoi(UUID bikeId)` calls `paymentRepository.findAllByRentalIdOrderByPaymentDateDesc(bikeId)` — passing `bikeId` into a `Payment.rental.id` lookup without filtering by `PaymentStatus.CONFIRMED`. **Stage C7.1 must retain this exact literal Java behavior initially** (`payments` where `rentalId == bikeId`, all statuses), **not** silently fix the defect. The corrected domain formula (linking via `rentals.bikeId == bikeId` and `status == 'CONFIRMED'`) is documented separately in Section 5.5 and Section 12 as a **proposed business-rule change requiring explicit future approval**, with distinguishing acceptance tests in Section 11.
5. **Resolved Decision 2 – Invalid Date Range Returns `400 BAD_REQUEST` (Intentional Compatibility Deviation on Route 60):**  
   Java throws `IllegalArgumentException("fromDate cannot be after toDate")` (`ReportService.java` line 157), and `GlobalExceptionHandler.java` lacks handlers for `IllegalArgumentException`, `MissingServletRequestParameterException`, and `MethodArgumentTypeMismatchException`, causing Java to return `500 INTERNAL_SERVER_ERROR`. As an **intentional compatibility deviation**, Stage C7.1 must return **HTTP `400`** (`400 BAD_REQUEST` / `400 VALIDATION_FAILED`) for `fromDate > toDate`, invalid date formats, and missing required parameters.
6. **Resolved Decision 3 – Scale-4 Financial Precision Without Rounding:**  
   In Java, `quantity` and `unitCost` are scale-2 `BigDecimal` database columns (`scale = 2`), so `quantity.multiply(unitCost)` produces exact scale-4 `BigDecimal` products (`scale = 4`) with **zero intermediate or final rounding**. All Stage C7.1 arithmetic (`+`, `-`, `*`, `abs`) must use integer `BigInt` in scale-2 (`10^-2`) or scale-4 (`10^-4`) units — **zero JavaScript floating-point math** — and emit unrounded scale-4 decimal JSON numbers (`sparePartsCost`, `stockInCost`, `stockOutCost`, `totalMaintenanceCost`, `netProfit`) matching Java Jackson serialization.
7. **Other Non-Obvious Java Semantics Preserved in Spec:**
   - `DashboardKpiDto.activeRentalsCount` counts **non-archived bikes with `status == 'RENTED'`** (`ReportService.java` lines 65, 70), not documents in `rentals`.
   - `DashboardKpiDto.monthlyExpenses` is initialized to `{ RON: 0, EUR: 0, USD: 0 }` and never populated in `ReportService.getDashboardKpis()`.
   - `DateRangeReportDto` stock movement summaries include `STOCK_IN`/`RETURN` (in) and `STOCK_OUT`/`SERVICE_USAGE` (out), ignoring `ADJUSTMENT` and `REVERSAL` movements (`ReportService.java` lines 184–191).

---

## 2. Complete Endpoint Inventory (Routes 58–61)

| Route # | Method | Exact Path | Controller Method | Required / Optional Inputs | Response DTO | Success Status | Error Statuses (Firebase) | Auth Requirement | Observed Client Consumers |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **58** | `GET` | `/api/v1/reports/dashboard` | `ReportController.getDashboardKpis` | None | `DashboardKpiDto` | `200 OK` | `401` | Authenticated (`createAuthMiddleware`) | Flutter (`dashboard_provider.dart` L50 via `ApiEndpoints.reportsDashboard`), React (`App.tsx` L75) |
| **59** | `GET` | `/api/v1/reports/fleet-utilization` | `ReportController.getFleetUtilization` | None | `FleetUtilizationDto` | `200 OK` | `401` | Authenticated (`createAuthMiddleware`) | Flutter (`dashboard_provider.dart` L51 via `ApiEndpoints.reportsUtilization`), React (`App.tsx` L75–76) |
| **60** | `GET` | `/api/v1/reports/date-range` | `ReportController.getDateRangeReport` | Query (required): `fromDate` (`YYYY-MM-DD`), `toDate` (`YYYY-MM-DD`) | `DateRangeReportDto` | `200 OK` | `400`, `401` *(intentional deviation from Java `500`)* | Authenticated (`createAuthMiddleware`) | React (`App.tsx` L453) |
| **61** | `GET` | `/api/v1/reports/bike-roi/{bikeId}` | `ReportController.getBikeRoi` | Path (required): `bikeId` (UUID) | `BikeRoiDto` | `200 OK` | `400`, `401`, `404` | Authenticated (`createAuthMiddleware`) | Flutter (`ApiEndpoints.reportsBikeRoi` defined at `api_endpoints.dart` L53) |

---

## 3. Java Source Audit with Line References

### 3.1 `ReportController.java`
File: `backend/src/main/java/ro/bikerental/modules/report/controller/ReportController.java` (lines 1–52)

- **Class Mapping (lines 16–18):** `@RestController`, `@RequestMapping("/api/v1/reports")`. No class-level or method-level `@PreAuthorize` guards.
- **`getDashboardKpis()` (lines 27–31):** `@GetMapping("/dashboard")` -> returns `ResponseEntity.ok(reportService.getDashboardKpis())`.
- **`getFleetUtilization()` (lines 33–37):** `@GetMapping("/fleet-utilization")` -> returns `ResponseEntity.ok(reportService.getFleetUtilization())`.
- **`getDateRangeReport(...)` (lines 39–45):** `@GetMapping("/date-range")` with required `@RequestParam LocalDate fromDate` (line 42) and `@RequestParam LocalDate toDate` (line 43) -> returns `ResponseEntity.ok(reportService.getDateRangeReport(fromDate, toDate))`.
- **`getBikeRoi(...)` (lines 47–51):** `@GetMapping("/bike-roi/{bikeId}")` with `@PathVariable UUID bikeId` (line 49) -> returns `ResponseEntity.ok(reportService.getBikeRoi(bikeId))`.

### 3.2 `ReportService.java`
File: `backend/src/main/java/ro/bikerental/modules/report/service/ReportService.java` (lines 1–215)

- **Dependencies (lines 35–57):** Injects `BikeRepository`, `RentalRepository`, `RentalChargeRepository`, `PaymentRepository`, `PartRepository`, `ServiceRecordRepository`, `StockMovementRepository`.
- **`getDashboardKpis()` (lines 59–96):**
  - Line 63: `List<Bike> allBikes = bikeRepository.findAll();`
  - Lines 64–67: Filters `!b.isArchived()` in memory and counts `BikeStatus.AVAILABLE`, `BikeStatus.RENTED`, `BikeStatus.IN_SERVICE`, plus total non-archived bikes (`totalFleet`).
  - Lines 69–72: Maps `available -> availableBikesCount`, `rented -> activeRentalsCount`, `inService -> inServiceBikesCount`, `totalFleet -> totalFleetCount`.
  - Lines 74–78: Calls `rentalChargeRepository.findOverdueOrDueByDate(LocalDate.now(), List.of(ChargeStatus.UNPAID, ChargeStatus.PARTIALLY_PAID)).size()` and sets `overdueChargesCount`.
  - Lines 80–81: Calls `partRepository.findLowStockParts().size()` and sets `lowStockPartsCount`.
  - Lines 84–93: Computes `startOfMonth = LocalDate.now().withDayOfMonth(1)` and `endOfMonth = LocalDate.now()`, calls `paymentRepository.sumConfirmedPaymentsByCurrency(startOfMonth, endOfMonth)`, uppercases `row[0]`, and updates `dto.getMonthlyRevenue()` only if `containsKey(currency)` is true.
  - Note: `dto.getMonthlyExpenses()` is never modified in `getDashboardKpis()`.
- **`getFleetUtilization()` (lines 98–107):**
  - Reads `bikeRepository.findAll()`, computes the same four non-archived bike counts (`totalFleet`, `rented`, `available`, `inMaintenance`), and constructs `new FleetUtilizationDto(totalFleet, rented, available, inMaintenance)`.
- **`getBikeRoi(UUID bikeId)` (lines 109–152):**
  - Lines 111–112: Loads `bikeRepository.findById(bikeId)` or throws `ResourceNotFoundException("Motorbike", bikeId)` (`404 NOT_FOUND` via `BusinessException`). Does **not** exclude archived bikes.
  - Lines 115–117: Sets `bikeId`, `registrationNumber`, and `makeModel = bike.getMake() + " " + bike.getModel()`.
  - Lines 120–125 (**Exact Bike ROI Revenue Evidence**):
    ```java
    paymentRepository.findAllByRentalIdOrderByPaymentDateDesc(bikeId).forEach(p -> {
        String curr = p.getCurrency().toUpperCase();
        if (dto.getTotalRevenue().containsKey(curr)) {
            dto.getTotalRevenue().put(curr, dto.getTotalRevenue().get(curr).add(p.getAmount()));
        }
    });
    ```
    Here `ReportService` passes `bikeId` into `findAllByRentalIdOrderByPaymentDateDesc(UUID rentalId)` (matching `Payment.rental.id = bikeId`, **not** `Payment.rental.bike.id = bikeId`), and **does not** filter out `PaymentStatus.REVERSED`.
  - Lines 128–142: Loads `serviceRecordRepository.findAllByBikeIdOrderByServiceDateDesc(bikeId)`. For every `ServiceRecord s` (regardless of `ServiceStatus`):
    - Line 132: Adds `s.getLabourCost()` (scale 2) to `dto.getTotalMaintenanceCost()` under `s.getLabourCurrency().toUpperCase()` (if key exists in `RON`/`EUR`/`USD`). No `.setScale(...)` or rounding.
    - Lines 135–141: For every `ServicePartUsage usage` in `s.getPartUsages()`: computes `BigDecimal partTotal = usage.getQuantity().multiply(usage.getUnitCost());` (line 137, scale `2 + 2 = 4`, unrounded) and adds it to `dto.getTotalMaintenanceCost()` under `usage.getCurrency().toUpperCase()` (line 139, unrounded).
  - Lines 145–149: For each `curr` in `List.of("RON", "EUR", "USD")`, sets `dto.getNetProfit().put(curr, rev.subtract(cost))` (line 148, exact `BigDecimal.subtract` without rounding).
- **`getDateRangeReport(LocalDate fromDate, LocalDate toDate)` (lines 154–194):**
  - Lines 156–158 (**Exact Invalid Date-Range Evidence**): `if (fromDate.isAfter(toDate)) { throw new IllegalArgumentException("fromDate cannot be after toDate"); }`.
  - Lines 160–166: Iterates `rentalRepository.findAll()` where `isInRange(r.getStartDate(), fromDate, toDate)`; increments `totalRentals` for all matching rentals, `activeRentals` when `r.getStatus() == RentalStatus.ACTIVE`, and `closedRentals` when `r.getStatus() == RentalStatus.CLOSED`.
  - Lines 167–170: Iterates `paymentRepository.findAll()` where `p.getStatus() == PaymentStatus.CONFIRMED` and `isInRange(p.getPaymentDate(), fromDate, toDate)`; calls `add(dto.getRevenue(), p.getCurrency(), safe(p.getAmount()))`.
  - Lines 171–178: Iterates `serviceRecordRepository.findAll()` where `isInRange(s.getServiceDate(), fromDate, toDate)`; increments `serviceCount`, calls `add(dto.getLabourCost(), s.getLabourCurrency(), safe(s.getLabourCost()))`, and at lines 176–177 executes `s.getPartUsages().forEach(u -> add(dto.getSparePartsCost(), u.getCurrency(), safe(u.getQuantity()).multiply(safe(u.getUnitCost()))))` (scale `2 + 2 = 4`, unrounded).
  - Lines 179–192: Iterates `stockMovementRepository.findAll()` where `isInRange(toDate(m.getCreatedAt()), fromDate, toDate)`:
    - Line 182: `BigDecimal quantity = safe(m.getQuantityDelta()).abs();` (scale 2)
    - Line 183: `BigDecimal cost = quantity.multiply(safe(m.getUnitCost()));` (scale `2 + 2 = 4`, unrounded)
    - Lines 184–186: `STOCK_IN` or `RETURN` -> `add(dto.getStockInQuantity(), "TOTAL", quantity)` and `add(dto.getStockInCost(), m.getCurrency(), cost)`
    - Lines 187–191: `STOCK_OUT` or `SERVICE_USAGE` -> `add(dto.getStockOutQuantity(), "TOTAL", quantity)` and `add(dto.getStockOutCost(), m.getCurrency(), cost)`
    - Other movement types (`ADJUSTMENT`, `REVERSAL`) are ignored.
- **Helpers (lines 196–214):**
  - `isInRange(LocalDate date, LocalDate from, LocalDate to)` (lines 196–198): `date != null && !date.isBefore(from) && !date.isAfter(to)` (inclusive on both endpoints).
  - `add(Map<String, BigDecimal> values, String key, BigDecimal amount)` (lines 200–206): returns early if `key == null || amount == null`, normalizes key with `key.toUpperCase().trim()`, and executes `values.put(normalizedKey, values.get(normalizedKey).add(amount))` only when `values.containsKey(normalizedKey)`. Performs **no rounding**.
  - `safe(BigDecimal value)` (lines 208–210): `return value != null ? value : BigDecimal.ZERO;`.
  - `toDate(Instant timestamp)` (lines 212–214): `timestamp != null ? timestamp.atZone(ZoneOffset.UTC).toLocalDate() : null`.

### 3.3 Report DTOs, Repositories, Entities, Exception Handling, and Security

- **Report DTOs:**
  - `DashboardKpiDto.java` (lines 1–52): `activeRentalsCount`, `availableBikesCount`, `inServiceBikesCount`, `totalFleetCount`, `overdueChargesCount`, `lowStockPartsCount`, `monthlyRevenue` (`HashMap`, lines 20–22 init `RON/EUR/USD` to `BigDecimal.ZERO`), `monthlyExpenses` (`HashMap`, lines 24–26 init `RON/EUR/USD` to `BigDecimal.ZERO`).
  - `FleetUtilizationDto.java` (lines 1–35): `totalBikes`, `rentedBikes`, `availableBikes`, `inMaintenanceBikes`, `utilizationRate` (line 18: `totalBikes > 0 ? (double) rentedBikes / totalBikes * 100.0 : 0.0`).
  - `DateRangeReportDto.java` (lines 1–47): `totalRentals`, `activeRentals`, `closedRentals`, `serviceCount`, `revenue`, `labourCost`, `sparePartsCost` (lines 20–26 init `RON/EUR/USD` to `BigDecimal.ZERO`), `stockInQuantity`, `stockOutQuantity` (lines 28–30 init `TOTAL` to `BigDecimal.ZERO`), `stockInCost`, `stockOutCost` (lines 20–26 init `RON/EUR/USD` to `BigDecimal.ZERO`).
  - `BikeRoiDto.java` (lines 1–48): `bikeId`, `registrationNumber`, `makeModel`, `totalRevenue`, `totalMaintenanceCost`, `netProfit` (lines 17–29 init `RON/EUR/USD` to `BigDecimal.ZERO`).
- **Repositories & Entity Column Scales:**
  - `BikeRepository.java` (lines 1–46) & `Bike.java` (lines 1–100): `status` (`AVAILABLE`, `RENTED`, `IN_SERVICE`, `INACTIVE`), `archived` (`is_archived`), `registrationNumber`, `make`, `model`.
  - `RentalRepository.java` (lines 1–41) & `Rental.java` (lines 24–30, 55–57): `bike` (`@ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "bike_id", nullable = false)`), `startDate` (`LocalDate`), `status` (`ACTIVE`, `CLOSED`, `CANCELLED`).
  - `RentalChargeRepository.java` (lines 31–39) & `RentalCharge.java` (lines 32–43): `findOverdueOrDueByDate` filters `rc.dueDate <= :date AND rc.status IN (:statuses)`.
  - `PaymentRepository.java` (lines 22, 42–50) & `Payment.java` (lines 27–52):
    - Line 22: `List<Payment> findAllByRentalIdOrderByPaymentDateDesc(UUID rentalId);` (derived query on `Payment.rental.id`, `Payment.java` lines 27–29: `@ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "rental_id") private Rental rental;`; `Payment` has no `bike` column).
    - `Payment.amount` (`Payment.java` lines 34–35): `precision = 14, scale = 2` (scale `2`).
    - `sumConfirmedPaymentsByCurrency` (lines 42–50): filters `p.status = 'CONFIRMED' AND p.paymentDate >= :startDate AND p.paymentDate <= :endDate GROUP BY p.currency`.
  - `PartRepository.java` (lines 23–27): `findLowStockParts` filters `p.active = true AND p.currentQuantity <= p.minReorderLevel`.
  - `ServiceRecordRepository.java` (line 19), `ServiceRecord.java` (lines 21–57), `ServicePartUsage.java` (lines 26–33):
    - `ServiceRecord.labourCost` (`ServiceRecord.java` lines 37–38): `precision = 14, scale = 2` (scale `2`).
    - `ServicePartUsage.quantity` (`ServicePartUsage.java` lines 26–27): `precision = 10, scale = 2` (scale `2`).
    - `ServicePartUsage.unitCost` (`ServicePartUsage.java` lines 29–30): `precision = 14, scale = 2` (scale `2`).
  - `StockMovementRepository.java` (lines 1–36) & `StockMovement.java` (lines 22–49):
    - `StockMovement.quantityDelta` (`StockMovement.java` lines 22–23): `precision = 10, scale = 2` (scale `2`).
    - `StockMovement.unitCost` (`StockMovement.java` lines 35–36): `precision = 14, scale = 2` (scale `2`).
- **Exception & Security Configuration:**
  - `ResourceNotFoundException.java` (lines 5–8): extends `BusinessException` with `HttpStatus.NOT_FOUND` and message `"%s with identifier '%s' was not found"` (`"Motorbike with identifier '<bikeId>' was not found"`).
  - `GlobalExceptionHandler.java` (lines 18–89): defines handlers only for `BusinessException` (lines 23–33 -> `ex.getStatus()`), `MethodArgumentNotValidException` (lines 35–54 -> `400 VALIDATION_FAILED`), `BadCredentialsException` (lines 56–65 -> `401`), `AccessDeniedException` (lines 67–76 -> `403`), and generic `Exception.class` (lines 78–88 -> `500 INTERNAL_SERVER_ERROR`). Because `IllegalArgumentException`, `MissingServletRequestParameterException`, and `MethodArgumentTypeMismatchException` are not mapped explicitly, Java returns `500 INTERNAL_SERVER_ERROR` for `fromDate > toDate`, missing query params, and malformed query dates.
  - `SecurityConfig.java` (lines 72–100): unauthenticated requests return `401 UNAUTHORIZED` (`{"status":401,"error":"UNAUTHORIZED","message":"Authentication required"}`); all `/api/v1/reports/**` routes fall under `.anyRequest().authenticated()` without role/owner checks.

---

## 4. Request and Response Contract Tables

### 4.1 Route 58 – `GET /api/v1/reports/dashboard`

- **Request:** No path variables, query parameters, or request body. Requires `Authorization: Bearer <token>`.
- **Response (`200 OK`, `DashboardKpiDto`):**

| Field | JSON Type | Exact Derivation / Initial Value |
| :--- | :--- | :--- |
| `activeRentalsCount` | integer (`number`) | Count of `bikes` with `!isArchived && status === 'RENTED'` |
| `availableBikesCount` | integer (`number`) | Count of `bikes` with `!isArchived && status === 'AVAILABLE'` |
| `inServiceBikesCount` | integer (`number`) | Count of `bikes` with `!isArchived && status === 'IN_SERVICE'` |
| `totalFleetCount` | integer (`number`) | Count of `bikes` with `!isArchived` (all statuses including `INACTIVE`) |
| `overdueChargesCount` | integer (`number`) | Count of `rental_charges` with `dueDate <= todayUtc` and `status` in `['UNPAID', 'PARTIALLY_PAID']` |
| `lowStockPartsCount` | integer (`number`) | Count of `parts` with `isActive === true` and `currentQuantity <= minReorderLevel` |
| `monthlyRevenue` | `{ RON: number, EUR: number, USD: number }` | Initialized to `{ RON: 0, EUR: 0, USD: 0 }`; sum of `CONFIRMED` payments with `startOfMonthUtc <= paymentDate <= todayUtc` per currency (scale 2) |
| `monthlyExpenses` | `{ RON: number, EUR: number, USD: number }` | Always `{ RON: 0, EUR: 0, USD: 0 }` (unpopulated in Java `ReportService.getDashboardKpis()`) |

### 4.2 Route 59 – `GET /api/v1/reports/fleet-utilization`

- **Request:** No path variables, query parameters, or request body. Requires `Authorization: Bearer <token>`.
- **Response (`200 OK`, `FleetUtilizationDto`):**

| Field | JSON Type | Exact Derivation |
| :--- | :--- | :--- |
| `totalBikes` | integer (`number`) | Count of `bikes` with `!isArchived` |
| `rentedBikes` | integer (`number`) | Count of `bikes` with `!isArchived && status === 'RENTED'` |
| `availableBikes` | integer (`number`) | Count of `bikes` with `!isArchived && status === 'AVAILABLE'` |
| `inMaintenanceBikes` | integer (`number`) | Count of `bikes` with `!isArchived && status === 'IN_SERVICE'` |
| `utilizationRate` | floating-point `number` | `totalBikes > 0 ? (rentedBikes / totalBikes) * 100.0 : 0.0` |

### 4.3 Route 60 – `GET /api/v1/reports/date-range`

- **Request Query Parameters:**

| Parameter | Type | Required | Validation Rule | Firebase Error on Invalid Input (Intentional Deviation -> Always HTTP `400`) |
| :--- | :--- | :---: | :--- | :--- |
| `fromDate` | ISO Date string | Yes | Present, non-empty string, valid `YYYY-MM-DD` calendar date via `parseDate` | `400 BAD_REQUEST` / `400 VALIDATION_FAILED` |
| `toDate` | ISO Date string | Yes | Present, non-empty string, valid `YYYY-MM-DD` calendar date via `parseDate` | `400 BAD_REQUEST` / `400 VALIDATION_FAILED` |
| Cross-field rule | — | — | `fromDate <= toDate` (`!isBefore(toDate, fromDate)`) | `400 BAD_REQUEST` (`BusinessError('fromDate cannot be after toDate')` -> `{"status":400,"error":"BAD_REQUEST","message":"fromDate cannot be after toDate","path":...}`) |

- **Response (`200 OK`, `DateRangeReportDto`):**

| Field | JSON Type | Default | Exact Derivation (`[fromDate, toDate]` inclusive) & Precision |
| :--- | :--- | :--- | :--- |
| `totalRentals` | integer (`number`) | `0` | Count of `rentals` with `fromDate <= startDate <= toDate` (all statuses) |
| `activeRentals` | integer (`number`) | `0` | Subset of above with `status === 'ACTIVE'` |
| `closedRentals` | integer (`number`) | `0` | Subset of above with `status === 'CLOSED'` |
| `serviceCount` | integer (`number`) | `0` | Count of `service_records` with `fromDate <= serviceDate <= toDate` (all statuses) |
| `revenue` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | Sum of `amount` for `payments` with `status === 'CONFIRMED'` and `fromDate <= paymentDate <= toDate` (scale 2, unrounded) |
| `labourCost` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | Sum of `labourCost` across matching `service_records`, grouped by `labourCurrency` (scale 2, unrounded) |
| `sparePartsCost` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | Sum of `quantity * unitCost` across `partsUsed` in matching `service_records`, grouped by usage `currency` (**exact scale 4, unrounded**) |
| `stockInQuantity` | `{ TOTAL: number }` | `{ TOTAL: 0 }` | Sum of `abs(quantityDelta)` for `stock_movements` (`createdAt` UTC date in range) with `movementType` in `['STOCK_IN', 'RETURN']` (scale 2, unrounded) |
| `stockOutQuantity` | `{ TOTAL: number }` | `{ TOTAL: 0 }` | Sum of `abs(quantityDelta)` for `stock_movements` (`createdAt` UTC date in range) with `movementType` in `['STOCK_OUT', 'SERVICE_USAGE']` (scale 2, unrounded) |
| `stockInCost` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | Sum of `abs(quantityDelta) * unitCost` for `STOCK_IN` / `RETURN` movements in range, grouped by `currency` (**exact scale 4, unrounded**) |
| `stockOutCost` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | Sum of `abs(quantityDelta) * unitCost` for `STOCK_OUT` / `SERVICE_USAGE` movements in range, grouped by `currency` (**exact scale 4, unrounded**) |

### 4.4 Route 61 – `GET /api/v1/reports/bike-roi/{bikeId}`

- **Request Path Parameter:** `bikeId` (required UUID string; invalid UUID -> `400 VALIDATION_FAILED`; nonexistent `bikes/{bikeId}` -> `404 NOT_FOUND`).
- **Response (`200 OK`, `BikeRoiDto`):**

| Field | JSON Type | Default | Exact Derivation (Literal Java Parity) & Precision |
| :--- | :--- | :--- | :--- |
| `bikeId` | UUID `string` | — | `bike.id` |
| `registrationNumber` | `string` | — | `bike.registrationNumber` |
| `makeModel` | `string` | — | `${bike.make} ${bike.model}` |
| `totalRevenue` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | **Retains literal Java query (`ReportService.java` L120):** sums `amount` across all `payments` where `rentalId === bikeId` (all statuses) for matching currency keys (scale 2, unrounded) |
| `totalMaintenanceCost` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | Across all `service_records` where `bikeId === param`: sum `labourCost` (`scale 2`) by `labourCurrency` + sum `quantity * unitCost` (`scale 4`) across `partsUsed` by usage `currency` (**exact scale 4, unrounded**) |
| `netProfit` | `Record<'RON' \| 'EUR' \| 'USD', number>` | `0` each | For each `curr` in `['RON', 'EUR', 'USD']`: `totalRevenue[curr] - totalMaintenanceCost[curr]` (**exact scale 4 signed**, may be negative, unrounded) |

### 4.5 Standard Error Envelope (`backend-firebase`)
All `400`, `401`, and `404` responses use the standard `backend-firebase` JSON error body (`status`, `error`, `message`, `path`, optional `validationErrors[]`), matching `GlobalExceptionHandler.java` and `src/shared/errors.ts`.

---

## 5. Financial Calculation Formulas

All financial and quantity calculations (`+`, `-`, `*`, `abs`) **must** execute in exact integer `BigInt` fixed-point arithmetic — **never** using JavaScript `number` / IEEE-754 floating-point math.

### 5.1 Audited Java `BigDecimal` Scale & Rounding Semantics

1. **Operand Scales (from JPA `@Column` definitions & DTO constructors):**
   - `Payment.amount` (`Payment.java` L34): `precision = 14, scale = 2` -> **scale `2`**.
   - `ServiceRecord.labourCost` (`ServiceRecord.java` L37): `precision = 14, scale = 2` -> **scale `2`**.
   - `ServicePartUsage.quantity` (`ServicePartUsage.java` L26): `precision = 10, scale = 2` -> **scale `2`**.
   - `ServicePartUsage.unitCost` (`ServicePartUsage.java` L29): `precision = 14, scale = 2` -> **scale `2`**.
   - `StockMovement.quantityDelta` (`StockMovement.java` L22): `precision = 10, scale = 2` -> **scale `2`**.
   - `StockMovement.unitCost` (`StockMovement.java` L35): `precision = 14, scale = 2` -> **scale `2`**.
   - Initial map entries (`DashboardKpiDto.java` L20–26, `DateRangeReportDto.java` L20–30, `BikeRoiDto.java` L18–28): `BigDecimal.ZERO` (**scale `0`**).
2. **Intermediate Multiplication Scale:**
   - Java `BigDecimal.multiply(BigDecimal)` sets result scale = `left.scale() + right.scale()` = `2 + 2 = 4` with **no rounding**:
     - `BikeRoiDto` (`ReportService.java` L137): `usage.getQuantity().multiply(usage.getUnitCost())` -> **scale `4`**.
     - `DateRangeReportDto.sparePartsCost` (`ReportService.java` L177): `safe(u.getQuantity()).multiply(safe(u.getUnitCost()))` -> **scale `4`**.
     - `DateRangeReportDto.stockInCost` / `stockOutCost` (`ReportService.java` L183): `quantity.multiply(safe(m.getUnitCost()))` -> **scale `4`**.
3. **Addition & Subtraction Behavior:**
   - Java `BigDecimal.add` and `BigDecimal.subtract` (`ReportService.java` L123, L132, L139, L148, L204) produce scale `Math.max(left.scale(), right.scale())` without rounding.
   - `DashboardKpiDto.monthlyRevenue`, `DateRangeReportDto.revenue`, `DateRangeReportDto.labourCost`, `DateRangeReportDto.stockInQuantity`, `DateRangeReportDto.stockOutQuantity`, and `BikeRoiDto.totalRevenue` sum scale-2 operands -> **scale `2`**.
   - `DateRangeReportDto.sparePartsCost`, `DateRangeReportDto.stockInCost`, `DateRangeReportDto.stockOutCost`, `BikeRoiDto.totalMaintenanceCost` (mixes scale-2 `labourCost` and scale-4 `partTotal`), and `BikeRoiDto.netProfit` (`rev.subtract(cost)`) accumulate at **scale `4`**.
4. **Explicit Rounding Operations:**
   - **None.** No `.setScale(...)`, `RoundingMode`, or `MathContext` appears anywhere in `ReportService.java` or any report DTO.
5. **Final DTO Serialization Behavior:**
   - Jackson serializes every `Map<String, BigDecimal>` entry as a JSON number retaining all significant scale-4 digits (for example, `1.25 * 10.05` produces `12.5625`, **not** `12.56`).

### 5.2 Fleet & Utilization Formulas (Routes 58 & 59)
Let $B_{\text{active}} = \{ b \in \text{bikes} \mid \neg b.\text{isArchived} \}$:
- $\text{availableBikesCount} = |\{ b \in B_{\text{active}} \mid b.\text{status} = \text{AVAILABLE} \}|$
- $\text{activeRentalsCount} = \text{rentedBikes} = |\{ b \in B_{\text{active}} \mid b.\text{status} = \text{RENTED} \}|$
- $\text{inServiceBikesCount} = \text{inMaintenanceBikes} = |\{ b \in B_{\text{active}} \mid b.\text{status} = \text{IN\_SERVICE} \}|$
- $\text{totalFleetCount} = \text{totalBikes} = |B_{\text{active}}|$ (includes non-archived `INACTIVE` bikes)
- $\text{utilizationRate} = \begin{cases} \frac{\text{rentedBikes}}{\text{totalBikes}} \times 100.0 & \text{if } \text{totalBikes} > 0 \\ 0.0 & \text{if } \text{totalBikes} = 0 \end{cases}$

Note: `utilizationRate` is a percentage metric (`private double utilizationRate`), not a currency value, and intentionally uses `double` division matching `FleetUtilizationDto.java` line 18.

### 5.3 Dashboard Charges, Low-Stock, and Monthly Revenue (Route 58)
- $\text{overdueChargesCount} = |\{ c \in \text{rental\_charges} \mid c.\text{dueDate} \le \text{todayUtc} \land c.\text{status} \in \{\text{UNPAID}, \text{PARTIALLY\_PAID}\} \}|$
- $\text{lowStockPartsCount} = |\{ p \in \text{parts} \mid p.\text{isActive} = \text{true} \land p.\text{currentQuantityMinor} \le p.\text{minReorderLevelMinor} \}|$ (indexed in Firestore by `isActive === true && isLowStock === true`)
- For each currency $c \in \{\text{RON}, \text{EUR}, \text{USD}\}$ (accumulated in `BigInt` minor units `10^-2`):
  $$\text{monthlyRevenue}[c] = \sum_{\substack{p \in \text{payments} \\ p.\text{status}=\text{CONFIRMED} \\ \text{monthStartUtc} \le p.\text{paymentDate} \le \text{todayUtc} \\ \text{upper}(p.\text{currency}) = c}} p.\text{amount}$$
- $\text{monthlyExpenses}[c] = 0$ for all $c \in \{\text{RON}, \text{EUR}, \text{USD}\}$.

### 5.4 Date-Range Formulas (Route 60)
Given inclusive `[fromDate, toDate]` (`fromDate <= toDate`):
- **Rentals** (filtering by `r.startDate` within `[fromDate, toDate]`):
  - $\text{totalRentals} = |R|$, $\text{activeRentals} = |\{r \in R \mid r.\text{status} = \text{ACTIVE}\}|$, $\text{closedRentals} = |\{r \in R \mid r.\text{status} = \text{CLOSED}\}|$ (`CANCELLED` increments `totalRentals` only).
- **Revenue** (accumulated in `BigInt` scale-2 units `10^-2`): sum of `p.amount` across `payments` with `status === 'CONFIRMED'`, `fromDate <= p.paymentDate <= toDate`, grouped by uppercase currency (`RON`, `EUR`, `USD`).
- **Servicing** (filtering `s.serviceDate` within `[fromDate, toDate]`, all 4 `ServiceStatus` values included):
  - $\text{serviceCount} = |S|$
  - $\text{labourCost}[c]$ (scale-2 `BigInt` `10^-2`): $\sum s.\text{labourCost}$ (where `upper(s.labourCurrency) === c`)
  - $\text{sparePartsCost}[c]$ (scale-4 `BigInt` `10^-4`): $\sum_{u \in s.\text{partsUsed}} (\text{toMinorUnits}(u.\text{quantity}) \times \text{toMinorUnits}(u.\text{unitCost}))$ (where `upper(u.currency) === c`)
- **Stock Movements** (filtering `toDateUtc(m.createdAt)` within `[fromDate, toDate]`):
  - For each movement: $\Delta_{\text{minor}} = |\text{toMinorUnits}(m.\text{quantityDelta})|$ (`BigInt`), $\text{cost}_{\text{scale4}} = \Delta_{\text{minor}} \times \text{toMinorUnits}(m.\text{unitCost})$ (`BigInt`).
  - If `m.movementType` in `['STOCK_IN', 'RETURN']`: add $\Delta_{\text{minor}}$ to `stockInQuantity["TOTAL"]` (scale 2), add $\text{cost}_{\text{scale4}}$ to `stockInCost[upper(m.currency)]` (scale 4).
  - If `m.movementType` in `['STOCK_OUT', 'SERVICE_USAGE']`: add $\Delta_{\text{minor}}$ to `stockOutQuantity["TOTAL"]` (scale 2), add $\text{cost}_{\text{scale4}}$ to `stockOutCost[upper(m.currency)]` (scale 4).
  - `ADJUSTMENT` and `REVERSAL` movements are ignored.

### 5.5 Bike ROI Formulas (Route 61)

#### 5.5.1 Authoritative Stage C7.1 Specification (Retains Literal Java Behavior)
For `bikes/{bikeId}` (throws `404 NotFoundError` if missing; archived bikes remain reportable):
- **Total Revenue (`BigInt` scale-2 minor units `10^-2`):**  
  Query `payments` where `rentalId === bikeId` (no `status` filter), matching `ReportService.java` lines 120–125:
  $$\text{totalRevenue}_{\text{scale2}}[c] = \sum_{\substack{p \in \text{payments} \\ p.\text{rentalId} = \text{bikeId} \\ \text{upper}(p.\text{currency}) = c}} \text{toMinorUnits}(p.\text{amount})$$
  *(Note: For normal domain data where `payment.rentalId` references a `rentals` document ID rather than a `bikes` document ID, this returns `0`.)*
- **Total Maintenance Cost (`BigInt` scale-4 units `10^-4`):**  
  Across all `service_records` where `s.bikeId === bikeId` (all statuses):
  $$\text{totalMaintenanceCost}_{\text{scale4}}[c] = \sum_{\substack{s \in \text{service\_records} \\ s.\text{bikeId} = \text{bikeId} \\ \text{upper}(s.\text{labourCurrency}) = c}} (\text{toMinorUnits}(s.\text{labourCost}) \times 100\text{n}) + \sum_{\substack{s \in \text{service\_records} \\ s.\text{bikeId} = \text{bikeId}}} \sum_{\substack{u \in s.\text{partsUsed} \\ \text{upper}(u.\text{currency}) = c}} (\text{toMinorUnits}(u.\text{quantity}) \times \text{toMinorUnits}(u.\text{unitCost}))$$
- **Net Profit (`BigInt` scale-4 units `10^-4`):**
  $$\text{netProfit}_{\text{scale4}}[c] = (\text{totalRevenue}_{\text{scale2}}[c] \times 100\text{n}) - \text{totalMaintenanceCost}_{\text{scale4}}[c]$$

#### 5.5.2 Proposed Future Business-Rule Change (Do NOT Implement Without Explicit Approval)
If product owners later approve fixing the Java Bike ROI defect:
1. Query `rentals` where `rental.bikeId === bikeId` to collect `rentalIds = { r.id }`.
2. Query `payments` for each `rentalId` in `rentalIds` (e.g., batching `in` clauses by 30 or parallel per-rental queries using existing `[rentalId ASC, paymentDate DESC]` index), filter strictly to `p.status === 'CONFIRMED'`, and sum `toMinorUnits(p.amount)` into `totalRevenue[c]`.
3. Keep `totalMaintenanceCost[c]` and `netProfit[c]` formulas unchanged.

---

## 6. Date and Currency Rules

1. **ISO Date Parsing & Calendar Bounds:**
   - Reuse `parseDate` from `backend-firebase/src/shared/dates.ts` (`^\d{4}-\d{2}-\d{2}$` with UTC round-trip check so dates like `2026-02-30` fail cleanly with `400`).
   - All date-range comparisons (`startDate`, `paymentDate`, `serviceDate`, `toDateUtc(createdAt)`) are **closed / inclusive** (`fromDate <= date <= toDate`).
   - Lexicographical string comparison (`left >= fromDate && left <= toDate`) is exact for `YYYY-MM-DD`.
2. **Server "Today" & "Start of Month":**
   - Java uses `LocalDate.now()` (`ReportService.java` lines 75, 84–85); Firebase uses `todayUtc()` from `src/shared/dates.ts` (`new Date().toISOString().slice(0, 10)`) and `startOfMonthUtc = `${todayUtc().slice(0, 8)}01``.
3. **`StockMovement.createdAt` Timestamp-to-UTC Date Boundary:**
   - Java (`ReportService.java` lines 212–214) converts `Instant` via `timestamp.atZone(ZoneOffset.UTC).toLocalDate()`.
   - In Firestore, `stock_movements.createdAt` is a `Timestamp`. Bounding `[fromDate, toDate]` translates to:
     - `startTs = Timestamp.fromDate(new Date(`${fromDate}T00:00:00.000Z`))`
     - `nextDayStartTs = Timestamp.fromDate(new Date(`${addDays(toDate, 1)}T00:00:00.000Z`))` (strict `< nextDayStartTs` includes all sub-millisecond nanoseconds on `toDate`), with a deterministic UTC date check (`timestampToUtcDate(doc.createdAt) >= fromDate && <= toDate`).
4. **Currency Map Initialization & Normalization:**
   - Every currency map is initialized as `{ RON: 0, EUR: 0, USD: 0 }`.
   - Incoming currency strings are normalized with `String(currency ?? '').trim().toUpperCase()`.
   - Unknown currencies (anything outside `'RON' | 'EUR' | 'USD'`) are ignored silently (matching `if (values.containsKey(normalizedKey))`).
5. **Fixed-Point `BigInt` Arithmetic & Unrounded Serialization (Zero JS Float Math):**
   - **Rule:** Never compute financial totals or products with JS `number` `+`, `-`, or `*` (which would introduce binary float drift such as `0.1 + 0.2 = 0.30000000000000004` or `1.25 * 10.05` rounding error).
   - **Scale-2 Totals (`monthlyRevenue`, `revenue`, `labourCost`, `stockInQuantity.TOTAL`, `stockOutQuantity.TOTAL`, `totalRevenue`):**
     - Accumulate in `bigint` minor units (`10^-2`) using `toMinorUnits` (`src/shared/money.ts`).
     - Convert via `fromMinorUnits(totalMinor)` to canonical string and serialize once at the DTO boundary using `moneyToJson` (`src/shared/money.ts` lines 40–46).
   - **Scale-4 Totals (`sparePartsCost`, `stockInCost`, `stockOutCost`, `totalMaintenanceCost`, `netProfit`):**
     - Accumulate products in `bigint` scale-4 units (`10^-4`) using `toMinorUnits(qty) * toMinorUnits(unitCost)` (note: `servicing.validation.ts` lines 92–129 already implements `toScale4Units`, `fromScale4Units`, and `scale4ToJson` — extract or share clean scale-4 helpers in `src/shared/money.ts` or `src/reports/` without breaking `servicing`).
     - Format signed scale-4 `bigint` to canonical decimal string (`fromScale4Units`: e.g. `125625n -> "12.5625"`, `-125625n -> "-12.5625"`, `0n -> "0.00"`, `10000n -> "1.00"`).
     - Serialize once at the DTO boundary (`scale4ToJson`): verify `abs(scale4Units) <= BigInt(Number.MAX_SAFE_INTEGER)` (supports values up to `900,719,925,474.0991` without decimal precision loss) and return `Number(canonicalString)`. Note `Number("12.5625") === 12.5625`, `Number("-25.0025") === -25.0025`, and `Number("0.00") === 0`, matching Jackson's unrounded `BigDecimal` JSON number output.

---

## 7. Firestore Implementation Mapping

### 7.1 Target Module Layout in `backend-firebase/`

```text
backend-firebase/src/
  reports/
    reports.types.ts        # DashboardKpiDto, FleetUtilizationDto, DateRangeReportDto, BikeRoiDto
    reports.validation.ts   # validateDateRangeQuery(query), validateBikeIdParam(bikeId)
    reports.repository.ts   # Indexed read-only Firestore queries for bikes, charges, parts, payments, rentals, services, movements
    reports.service.ts      # Pure BigInt currency/scale-4 aggregation logic
  controllers/
    reports.controller.ts   # Express handlers for Routes 58–61
  routes/
    reports.routes.ts       # Router mounted at /api/v1/reports using createAuthMiddleware ONLY (no ownerMiddleware)
  app.ts                    # Register app.use('/api/v1/reports', createReportsRouter(...))
```

### 7.2 Collection Queries per Endpoint

| Endpoint | Collections Queried | Exact Firestore Query / Strategy |
| :--- | :--- | :--- |
| **58** `/dashboard` | `bikes`, `rental_charges`, `parts`, `payments` | Executed concurrently via `Promise.all`:<br>1. `bikes.where('isArchived', '==', false).get()` *(verify `isArchived` presence across bike writers; see note below)*<br>2. Two parallel charge queries using existing `[status ASC, dueDate ASC]` index: `rental_charges.where('status', '==', 'UNPAID').where('dueDate', '<=', todayUtc).get()` and `rental_charges.where('status', '==', 'PARTIALLY_PAID').where('dueDate', '<=', todayUtc).get()`<br>3. `parts.where('isActive', '==', true).where('isLowStock', '==', true).get()`<br>4. `payments.where('status', '==', 'CONFIRMED').where('paymentDate', '>=', monthStartUtc).where('paymentDate', '<=', todayUtc).get()` |
| **59** `/fleet-utilization` | `bikes` | `bikes.where('isArchived', '==', false).get()` |
| **60** `/date-range` | `rentals`, `payments`, `service_records`, `stock_movements` | Executed concurrently via `Promise.all`:<br>1. `rentals.where('startDate', '>=', fromDate).where('startDate', '<=', toDate).get()`<br>2. `payments.where('status', '==', 'CONFIRMED').where('paymentDate', '>=', fromDate).where('paymentDate', '<=', toDate).get()`<br>3. `service_records.where('serviceDate', '>=', fromDate).where('serviceDate', '<=', toDate).get()` (uses embedded `partsUsed` array — zero child reads)<br>4. `stock_movements.where('createdAt', '>=', startTs).where('createdAt', '<', nextDayStartTs).get()` |
| **61** `/bike-roi/{bikeId}` | `bikes`, `service_records`, `payments` | 1. `bikes.doc(bikeId).get()` (`404 NotFoundError` if `!snap.exists`)<br>2. In parallel: `service_records.where('bikeId', '==', bikeId).orderBy('serviceDate', 'desc').get()` (reads embedded `partsUsed`) + **literal Java parity query:** `payments.where('rentalId', '==', bikeId).orderBy('paymentDate', 'desc').get()` |

> **Important `BikeDocument` Field Note:** During Stage C7.1, verify in `src/bike/` and existing tests whether all `bikes` documents store `isArchived: boolean` (as opposed to `archived: boolean`). If any legacy fixture uses `archived` without `isArchived`, read `bikes.get()` and filter `!(data.isArchived === true || data.archived === true)` to guarantee exact parity with Java `bikeRepository.findAll()`.

---

## 8. Required Firestore Indexes

Audit of `backend-firebase/firestore.indexes.json` confirms that **zero new composite indexes are required** for Routes 58–61:

| Query | Collection | Equality / Inequality / Order Fields | Index Status in `firestore.indexes.json` |
| :--- | :--- | :--- | :--- |
| Active bikes | `bikes` | `isArchived == false` | Automatic single-field index |
| Overdue charges (`UNPAID`, `PARTIALLY_PAID`) | `rental_charges` | `status == ...`, `dueDate <= today` | **Already exists** (lines 173–180: `status ASC`, `dueDate ASC`) |
| Low-stock parts | `parts` | `isActive == true`, `isLowStock == true` | **Already exists** as prefix (lines 634–642: `isActive ASC`, `isLowStock ASC`, `partCode ASC`) |
| Confirmed payments by `paymentDate` range (Dashboard & Date-Range) | `payments` | `status == 'CONFIRMED'`, `paymentDate >= ...`, `paymentDate <= ...` | **Already exists** (lines 287–293: `status ASC`, `paymentDate ASC`) |
| Rentals by `startDate` range | `rentals` | `startDate >= fromDate`, `startDate <= toDate` | Automatic single-field index (`startDate`) |
| Services by `serviceDate` range | `service_records` | `serviceDate >= fromDate`, `serviceDate <= toDate` | Automatic single-field index (`serviceDate`) |
| Stock movements by `createdAt` range | `stock_movements` | `createdAt >= startTs`, `createdAt < nextDayTs` | Automatic single-field index (`createdAt`) |
| Bike service records ordered by `serviceDate` DESC | `service_records` | `bikeId == bikeId`, `orderBy serviceDate DESC` | **Already exists** (lines 763–770: `bikeId ASC`, `serviceDate DESC`) |
| Payments by `rentalId` ordered by `paymentDate` DESC (Bike ROI literal parity) | `payments` | `rentalId == bikeId`, `orderBy paymentDate DESC` | **Already exists** (lines 560–567: `rentalId ASC`, `paymentDate DESC`) |

*(Even if the proposed future Bike ROI business-rule change in Section 5.5.2 is later approved, `[rentalId ASC, paymentDate DESC]` on `payments` at lines 560–567 and `[bikeId ASC, startDate ASC]` on `rentals` at lines 35–42 already exist.)*

---

## 9. Transaction and Read-Budget Analysis

- **Write Transactions Required:** **0**. All report endpoints are strictly read-only.
- **Per-Endpoint Firestore Document Read Budget:**
  - **Route 58 (`dashboard`):** $|B_{\text{active}}| + |\text{overdueUnpaid}| + |\text{overduePartial}| + |\text{lowStockParts}| + |\text{monthConfirmedPayments}|$.
  - **Route 59 (`fleet-utilization`):** $|B_{\text{active}}|$ reads.
  - **Route 60 (`date-range`):** Bounded solely by `[fromDate, toDate]`: $|\text{rentalsInRange}| + |\text{confirmedPaymentsInRange}| + |\text{servicesInRange}| + |\text{movementsInRange}|$. Unlike Java's four unfiltered `.findAll()` calls (`ReportService.java` L160, L167, L171, L179), Firestore pushes date/status predicates to indexed queries and reads embedded `partsUsed` directly from `service_records`.
  - **Route 61 (`bike-roi/{bikeId}`):** `1` (`bikes/{bikeId}`) + $|\text{servicesForBike}|$ + $|\text{paymentsWithRentalIdEqualsBikeId}|$.

---

## 10. Java / Firebase Compatibility Differences

| # | Area | Java Authoritative Behavior | Stage C7.1 Firebase Specification | Status / Rationale |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Bike ROI Revenue Lookup (`ReportService.java` L120, `PaymentRepository.java` L22)** | Calls `paymentRepository.findAllByRentalIdOrderByPaymentDateDesc(bikeId)` passing `bikeId` as `:rentalId`, without filtering `PaymentStatus.CONFIRMED`. Normally yields `0` revenue when `payment.rentalId` is a rental UUID. | **Retain literal Java parity:** query `payments` where `rentalId === bikeId` (no `CONFIRMED` filter). **Do not** silently fix in Stage C7.1; keep corrected rental-linked rule as a separate proposal (Section 5.5.2 / Section 12). | **1:1 Parity Retained** |
| **2** | **`fromDate > toDate` HTTP Status (`ReportService.java` L156–158, `GlobalExceptionHandler.java` L78–88)** | Throws `IllegalArgumentException("fromDate cannot be after toDate")`. No `@ExceptionHandler(IllegalArgumentException.class)` exists, so Java returns **`500 INTERNAL_SERVER_ERROR`**. | Return **HTTP `400 BAD_REQUEST`** (`BusinessError('fromDate cannot be after toDate')`). | **Intentional Compatibility Deviation** |
| **3** | **Missing or Malformed `fromDate` / `toDate` (`ReportController.java` L41–44, `GlobalExceptionHandler.java` L78–88)** | `MissingServletRequestParameterException` and `MethodArgumentTypeMismatchException` are also unhandled by `GlobalExceptionHandler`, returning **`500 INTERNAL_SERVER_ERROR`** in Java. | Return **HTTP `400`** (`400 VALIDATION_FAILED` / `400 BAD_REQUEST`) with structured validation/error details. | **Intentional Compatibility Deviation** |
| **4** | **Scale-4 `quantity * unitCost` Precision (`ReportService.java` L137, L177, L183)** | Multiply scale-2 `BigDecimal`s into exact scale-4 `BigDecimal`s (`2 + 2 = 4`) and sum/subtract with zero rounding (`1.25 * 10.05 = 12.5625`). | Accumulate in `BigInt` scale-4 (`10^-4`) units (`toMinorUnits(qty) * toMinorUnits(unitCost)`) and serialize exact scale-4 JSON numbers via `scale4ToJson` without JS floats or rounding to 2 decimals. | **1:1 Parity Preserved** |
| **5** | **Bike Not Found Error Message (`ReportService.java` L112)** | `404 NOT_FOUND` with `"Motorbike with identifier '<bikeId>' was not found"`. | `NotFoundError('Motorbike', bikeId)` returns `404 NOT_FOUND` (`"Motorbike not found: <bikeId>"`), matching Stages C1–C6. | **Standard Firebase Convention** |
| **6** | **`activeRentalsCount` Definition (`ReportService.java` L65, L70)** | Counts non-archived bikes with `status == RENTED`, not `rentals` with `status == ACTIVE`. | Preserve exact Java behavior (`!isArchived && status === 'RENTED'`). | **1:1 Parity Preserved** |
| **7** | **`monthlyExpenses` in Dashboard (`DashboardKpiDto.java` L24–26)** | Initialized to `{ RON: 0, EUR: 0, USD: 0 }` and never modified in `ReportService.getDashboardKpis()`. | Preserve `{ RON: 0, EUR: 0, USD: 0 }` verbatim. | **1:1 Parity Preserved** |
| **8** | **Server Timezone for `today` & `monthStart`** | `LocalDate.now()` (`application.yml` L17 sets Hibernate JDBC `Europe/Bucharest`, while `ReportService.toDate` L213 uses `ZoneOffset.UTC`). | Standardized to UTC (`todayUtc()`, UTC month start, UTC `createdAt` date conversion) matching Stages C3–C6 in `backend-firebase`. | **Standard Firebase UTC Rule** |

---

## 11. Testing and Acceptance Criteria

### 11.1 Unit Tests (`backend-firebase/tests/reports.unit.test.ts`)
Must test offline without network/Firestore calls:
1. **Date-Range Query Validation (All 5 Required Cases):**
   - `fromDate` earlier than `toDate` (`2026-06-01`, `2026-06-30`) -> valid.
   - `fromDate` equal to `toDate` (`2026-06-15`, `2026-06-15`) -> valid inclusive single-day range.
   - `fromDate` later than `toDate` (`2026-06-20`, `2026-06-10`) -> throws `400` (`fromDate cannot be after toDate`).
   - Invalid date formats (`2026-02-29`, `2026-13-01`, `15/06/2026`, `not-a-date`, empty string) -> throws `400 ValidationError`.
   - Missing required parameters (`fromDate` missing, `toDate` missing, both missing) -> throws `400 ValidationError`.
2. **Path Parameter Validation:**
   - Invalid `bikeId` UUID on `/bike-roi/:bikeId` -> throws `400 ValidationError`.
3. **Dashboard & Utilization Formulas:**
   - Excludes archived bikes from `totalFleetCount` / `totalBikes`; includes non-archived `INACTIVE` bikes in denominator.
   - `totalBikes === 0` returns `utilizationRate: 0` (no `NaN` / division by zero).
   - Multi-currency `monthlyRevenue` (`RON`, `EUR`, `USD`) defaults missing currencies to `0`, ignores unknown currencies (e.g. `GBP`), and keeps `monthlyExpenses = { RON: 0, EUR: 0, USD: 0 }`.
4. **Scale-4 `BigInt` Precision & Zero Float Drift (Non-Rounded):**
   - Part usage `quantity: "1.25"`, `unitCost: "10.05"` -> `sparePartsCost` & `totalMaintenanceCost` contain exact `12.5625` (NOT `12.56` or float-drifted).
   - Stock movement `quantityDelta: "-2.75"`, `unitCost: "3.33"` -> `abs(quantityDelta) = 2.75` (`stockOutQuantity.TOTAL`), `stockOutCost = 9.1575` (scale 4, exact).
   - Multi-line decimal sums such as `0.10 + 0.20` and `0.01 * 0.01 = 0.0001` preserve exact decimal digits (`0.3`, `0.0001`) with zero IEEE-754 drift.
   - `totalRevenue (scale 2) - totalMaintenanceCost (scale 4)` produces exact signed `netProfit` (e.g., `100.00 - 12.5625 = 87.4375`, and negative `0 - 12.5625 = -12.5625`).
5. **Stock Movement Type Filtering & UTC Timestamp Conversion:**
   - `STOCK_IN` & `RETURN` increment `stockInQuantity.TOTAL` and `stockInCost`; `STOCK_OUT` & `SERVICE_USAGE` increment `stockOutQuantity.TOTAL` and `stockOutCost`; `ADJUSTMENT` & `REVERSAL` are ignored.
   - `stock_movements.createdAt` on `2026-06-01T23:59:59.999Z` maps to `2026-06-01` in UTC, and `2026-06-02T00:00:00.000Z` maps to `2026-06-02`.
6. **Bike ROI – Distinguishing Literal Java Parity vs Proposed Corrected Calculation:**
   - **Test Case A (Normal Rental-Linked Bike Revenue):** Bike `B1`, Rental `R1` (`R1.bikeId = B1`), `CONFIRMED` Payment `P1` (`P1.rentalId = R1`, `amount = "500.00"` RON), plus Service `S1` on `B1` (`labourCost = "100.00"`, 1 part `qty = "1.25", unitCost = "10.05"`). Verify Stage C7.1 implementation returns `totalRevenue.RON === 0`, `totalMaintenanceCost.RON === 112.5625`, `netProfit.RON === -112.5625` (contrasted explicitly in test comments/assertions with the proposed corrected rule which would yield `totalRevenue.RON === 500`, `netProfit.RON === 387.4375`).
   - **Test Case B (Direct `rentalId === bikeId` Payment, Including `REVERSED`):** Seed Payment `P2` with `rentalId = B1` (`amount = "250.00"` RON, `CONFIRMED`) and `P3` with `rentalId = B1` (`amount = "50.00"` RON, `REVERSED`). Verify literal Java parity returns `totalRevenue.RON === 300` (includes both because Java `ReportService.java` L120–125 does not filter `CONFIRMED`) and `netProfit.RON === 187.4375`.

### 11.2 Firestore Emulator Integration Tests (`backend-firebase/tests/reports.test.ts` registered in `tests/run-tests.ts`)
1. **All 4 Routes Exercised Live Against Firestore Emulator:**
   - `GET /api/v1/reports/dashboard` -> `200 OK`
   - `GET /api/v1/reports/fleet-utilization` -> `200 OK`
   - `GET /api/v1/reports/date-range?fromDate=...&toDate=...` -> `200 OK`
   - `GET /api/v1/reports/bike-roi/:bikeId` -> `200 OK`
2. **Authentication & Role Parity:**
   - Missing or invalid bearer token -> `401 UNAUTHORIZED` on all 4 routes.
   - Authenticated `ROLE_CUSTOMER` and `ROLE_OWNER` both receive `200 OK` (verifies `createAuthMiddleware` without `ownerMiddleware`).
3. **All 5 Date-Range Acceptance Cases Live via HTTP:**
   - `fromDate < toDate` (`200 OK`, verifies boundary-inclusive rentals, confirmed-only payments, all-status services with scale-4 `sparePartsCost`, and `STOCK_IN`/`RETURN`/`STOCK_OUT`/`SERVICE_USAGE` vs ignored `ADJUSTMENT`/`REVERSAL`).
   - `fromDate == toDate` (`200 OK`, single-day inclusive boundary including `23:59:59.999Z` UTC movement timestamp).
   - `fromDate > toDate` (`400`, `message: "fromDate cannot be after toDate"` — verifies intentional deviation from Java `500`).
   - Invalid date formats (`fromDate=2026-02-30`, `toDate=bad-date`) -> `400`.
   - Missing `fromDate` and/or `toDate` -> `400`.
4. **Live Bike ROI End-to-End Cases (Distinguishing Bug Parity vs Domain Linkage):**
   - Nonexistent `bikeId` -> `404 NOT_FOUND`; malformed UUID -> `400`.
   - Archived bike with service history -> `200 OK` with maintenance costs & negative `netProfit`.
   - **Normal rental-to-bike payment linkage test:** Create rental `R1` for `bikeId = B1` and record payment `P1` against `R1` -> live `GET /api/v1/reports/bike-roi/:B1` confirms `totalRevenue` stays `{ RON: 0, EUR: 0, USD: 0 }` (proving literal Java `ReportService.java` L120 parity is preserved and not silently altered).
   - **Direct `rentalId = B1` payment test:** Seed payment document with `rentalId = B1` (and multi-currency labour + scale-4 spare part usages via `POST /api/v1/services`) -> live `GET /api/v1/reports/bike-roi/:B1` returns exact `totalRevenue`, scale-4 `totalMaintenanceCost`, and signed scale-4 `netProfit`.

---

## 12. Resolved Clarifications & Future Change Proposals

All three Stage C7.0 questions have been resolved in **Stage C7.0.1**:

1. **Resolved – `GET /api/v1/reports/bike-roi/{bikeId}` Payment Revenue Query (Question 1):**
   - **Stage C7.1 Rule:** Retain **literal Java behavior** (`payments` where `rentalId === bikeId`, without `status === 'CONFIRMED'` filter), matching `ReportService.java` lines 120–125 and `PaymentRepository.java` line 22.
   - **Proposed Future Business-Rule Change (Requires Explicit Approval Before Changing):** Fix per-bike revenue by resolving `rentals` where `rental.bikeId === bikeId` and summing only `CONFIRMED` payments for those rental IDs (documented in Section 5.5.2; do **not** implement during Stage C7.1).
2. **Resolved – Invalid Date Range & Missing/Malformed Query Params on `GET /api/v1/reports/date-range` (Question 2):**
   - **Stage C7.1 Rule (Intentional Compatibility Deviation):** Return **HTTP `400`** (`400 BAD_REQUEST` for `fromDate > toDate` with `"fromDate cannot be after toDate"`, and `400` for invalid formats or missing `fromDate`/`toDate`) rather than Java's unhandled-exception `500 INTERNAL_SERVER_ERROR` via `GlobalExceptionHandler.handleGenericException`.
3. **Resolved – Scale-4 Financial Precision & Serialization (Question 3):**
   - **Stage C7.1 Rule:** Match Java `BigDecimal` exactness with **zero JavaScript floating-point arithmetic** and **zero rounding**: compute scale-2 inputs (`amount`, `labourCost`, `quantity`, `unitCost`, `quantityDelta`) in `BigInt` minor units (`10^-2`), compute `quantity * unitCost` products and cost/profit accumulators (`sparePartsCost`, `stockInCost`, `stockOutCost`, `totalMaintenanceCost`, `netProfit`) in `BigInt` scale-4 units (`10^-4`), and serialize unrounded JSON numbers (e.g., `12.5625`).

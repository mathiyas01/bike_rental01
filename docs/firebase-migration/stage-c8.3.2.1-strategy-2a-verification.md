# Stage C8.3.2.1 – Strategy 2A Query Semantics Verification

**Date:** 2026-11-16  
**Scope:** Pre-implementation verification of Strategy 2A from [stage-c8.3.2-index-quota-optimization-assessment.md](stage-c8.3.2-index-quota-optimization-assessment.md) against `RentalRepository`, `RentalService`, `firestore.indexes.json`, and existing Stage C3–C8 tests.  
**Status:** Read-Only Verification — No source, index, test, frontend, Java, or Firebase resources were modified.

---

## 1. Existing Pagination Behaviour (`GET /api/v1/rental-charges`)

Inspected `RentalService.listCharges` ([rental.service.ts](../../backend-firebase/src/rental/rental.service.ts#L557-L581)) and `RentalRepository.pageCharges` / `pageQuery` ([rental.repository.ts](../../backend-firebase/src/rental/rental.repository.ts#L154-L210)):

| Property | Verified Current Behaviour |
| :--- | :--- |
| **Bounded vs. Unbounded** | **Unbounded.** `pageCharges` applies no total-document cap (no `.limit(1001)`). |
| **Total Element Counts** | Computed across **all** matching documents via `await baseQuery.count().get()` (`rental.repository.ts:192`). |
| **Sorting Before Pagination** | **Yes.** Firestore applies `.orderBy(page.sortField, dir).orderBy(FieldPath.documentId(), dir)` before `.limit(page.size)`. |
| **Cursor vs. Offset Pagination** | Uses **Firestore `startAfter(last)` cursor walking** in a `for (currentPage = 0; currentPage <= page.page; currentPage++)` loop (`rental.repository.ts:197-208`) to emulate 0-indexed `page`/`size` offset pagination (`size` `1..100`). |
| **Access Beyond First 1,000 Docs** | **Yes.** Because `pageCharges` has no 1,000-doc cap, callers can request `page=50&size=20` (`> 1,000`) by walking `startAfter` cursors. |

---

## 2. Evaluation of Proposed `rentalId` Query (`where('rentalId', '==', rentalId).limit(1001)`)

When `filters.rentalId` is present on `GET /api/v1/rental-charges`, Strategy 2A proposes querying `.where('rentalId', '==', filters.rentalId).limit(1001)` (using Firestore's single-field auto-index) and performing `status`/`currency`/`customerId` filtering, sorting, and slicing in memory:

1. **Filter Semantics:** Preserved **identically** (`===` checks for `status`, `currency`, `customerId`), provided the rental has `<= 1,000` charges.
2. **Sorting Across All Matching Documents:** Preserved **identically** across `dueDate`, `createdAt`, `chargeSequence`, and `status` with document-ID tie-breaking — **provided** the in-memory comparator uses deterministic UTF-8/code-point `<`/`>` string ordering (not locale-dependent `localeCompare`), numeric `chargeSequence` comparison, and `(seconds, nanoseconds)` `Timestamp` comparison for `createdAt` matching Firestore's `.orderBy(sortField, dir).orderBy(FieldPath.documentId(), dir)`.
3. **Pagination & Total Counts:** Preserved **identically** (`totalElements = filteredSorted.length`, `content = slice(page * size, (page + 1) * size)`, `toPage(...)`) for rentals with `<= 1,000` charges.
4. **Previously Accessible Records:** A rental with `> 1,000` charges (>19.2 years of weekly billing) was technically pageable via `pageCharges` before, whereas `.limit(1001)` caps `rentalId`-scoped `pageCharges` at 1,000 docs (and must **throw an error** rather than silently truncating if `1001` docs are returned). Note that normal API lifecycle endpoints (`generateUpToDate` and `chargesForRental`) already prevent or reject rentals exceeding 1,000 charges.
5. **Consistency Under Concurrent Writes:**
   - **Within a single request:** Improved over `pageQuery`, because `totalElements` and `content` derive from the same snapshot rather than a separate `count().get()` + `startAfter` walk.
   - **Between separate `page=0` and `page=1` HTTP requests:** Equivalent to `pageQuery` (neither holds a multi-request snapshot cursor, so concurrent inserts/updates between HTTP calls can shift page boundaries in both).

---

## 3. Existing 1,000-Document Safeguards (`pageCharges` vs. `chargesForRental`)

| Aspect | `chargesForRental` (Route 28) | `pageCharges` (Route 30) |
| :--- | :--- | :--- |
| **Endpoint** | `GET /api/v1/rental-charges/rental/:rentalId` | `GET /api/v1/rental-charges` |
| **Response Shape** | Unpaginated `RentalChargeDto[]` | Paginated `PageResponse<RentalChargeDto>` |
| **Current 1,000-Doc Limit** | **Yes** (`rental.repository.ts:182` `.limit(1001)`, `rental.service.ts:533-535` throws `409 OperationalError`) | **No** (currently unbounded) |

**Conclusion:** The 1,000-document limit is **not** an existing guarantee of Route 30 (`pageCharges`); it is a **new restriction** specifically when `rentalId` is passed to Route 30. However, because `generateUpToDate` (`rental.service.ts:512`) and `chargesForRental` (`rental.service.ts:533`) already enforce a 1,000-charge-per-rental ceiling (~19.2 years of weekly charges), no normal rental created via the API can exceed 1,000 charges.

---

## 4. Redundant Index Verification

1. **`payment_allocations` (`rentalChargeId: ASCENDING`):**
   - Verified across all `backend-firebase/src/**/*.ts`: `payment_allocations` is queried **only** by single-field `rentalChargeId` (`==` or `in`, `rental.repository.ts:220`, `payment.repository.ts:260`) or `paymentId` (`==` or `in`, `payment.repository.ts:265, 392`).
   - With `fieldOverrides: []` in `firestore.indexes.json`, Firestore's automatic single-field indexing covers both fields. This composite index entry is **100% redundant**.
2. **`suppliers` (`isActive: ASCENDING | nameNormalized: ASCENDING/DESCENDING`):**
   - Verified across all `backend-firebase/src/**/*.ts`: `nameNormalized` is only stored (`inventory.service.ts:372`) and hashed for `supplierNameLockId` (`inventory.service.ts:356`).
   - `InventoryRepository.pageSuppliers` (`inventory.repository.ts:497-528`) only orders Firestore queries by `name`, and `parseSupplierSearchQuery` (`inventory.validation.ts:473`) only allows `['name', 'createdAt', 'isActive']`. Both `nameNormalized` indexes are **100% unused**.

---

## 5. Recommendation

**Decision: Approve Strategy 2A with additional safeguards.**

Strategy 2A safely reduces `firestore.indexes.json` from **207** to **156** composite indexes (**44 below** Firestore's 200-index default quota) without restricting any API filter or sort option and without requiring a GCP quota escalation.

### Required Safeguards Before Implementation
1. **Explicit Overflow Error (No Silent Truncation):** If `where('rentalId', '==', rentalId).limit(1001)` returns `> 1000` documents, throw an explicit error (`422 UnprocessableEntityError` or `409 OperationalError`, matching `ServicingRepository` / `chargesForRental`) rather than truncating `totalElements` or `content`.
2. **Firestore-Exact In-Memory Comparator:** Sort `dueDate`, `status`, and tie-breaker `id` using code-point `<`/`>` comparison (matching Firestore UTF-8 order), `chargeSequence` numerically, and `createdAt` by `(seconds, nanoseconds)` in `page.direction` (`ASC` or `DESC`).
3. **Preserve Core `rentalId` Composite Indexes:** Keep `[rentalId ASC, chargeSequence ASC]`, `[rentalId ASC, chargeSequence DESC]`, and `[status ASC, currency ASC, rentalId ASC, dueDate ASC]` for `chargesForRental`, `generateNext`, and `AUTO_FIFO` payments; remove only the 48 multi-filter `pageCharges` `rentalId` indexes plus the 3 redundant `payment_allocations`/`suppliers` indexes.
4. **Regression Tests:** Add unit/emulator tests covering `pageCharges` with `rentalId` across all `{status, currency, customerId}` × `{dueDate, createdAt, chargeSequence, status}` × `{ASC, DESC}` combinations, pagination slicing, and the `> 1,000` overflow error.

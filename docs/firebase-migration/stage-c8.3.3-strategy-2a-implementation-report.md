# Stage C8.3.3 – Strategy 2A Implementation Report

**Date:** 2026-11-16  
**Scope:** Implementation of Strategy 2A per [stage-c8.3.2-index-quota-optimization-assessment.md](stage-c8.3.2-index-quota-optimization-assessment.md) and [stage-c8.3.2.1-strategy-2a-verification.md](stage-c8.3.2.1-strategy-2a-verification.md).

---

## 1. Source & Index Changes

### Source Changes ([rental.repository.ts](../../backend-firebase/src/rental/rental.repository.ts))
- Added `MAX_RENTAL_CHARGE_SCAN_DOCS = 1000` and injected optional `maxRentalChargeScanDocs = MAX_RENTAL_CHARGE_SCAN_DOCS` in `RentalRepository` constructor.
- Updated `RentalRepository.pageCharges`:
  - **When `filters.rentalId` is supplied:** Queries `.where('rentalId', '==', filters.rentalId).limit(this.maxRentalChargeScanDocs + 1)` using Firestore's single-field auto-index. If `snapshot.docs.length > this.maxRentalChargeScanDocs` (`1,001` docs), throws `422 UnprocessableEntityError` (never silently truncates). For `<= 1,000` docs, applies remaining `status`/`currency`/`customerId` filters, sorting, pagination slicing, and `totalElements` calculation in memory via `filterAndSortRentalCharges`.
  - **When `filters.rentalId` is omitted:** Preserves the original `baseQuery` + `pageQuery` (`count().get()` + `.orderBy(...)` + `.startAfter(...)`) implementation with zero new document limits.

### Sorting Implementation
- Exported `compareCodePoint`, `compareChargeTimestamps`, and `filterAndSortRentalCharges`:
  - **String fields (`dueDate`, `status`, tie-breaker `id`):** Deterministic code-point `<` / `>` ordering (no `localeCompare`).
  - **`chargeSequence`:** Numeric ordering (`left.chargeSequence - right.chargeSequence`).
  - **`createdAt`:** Timestamp `(seconds, nanoseconds)` comparison via `compareChargeTimestamps`.
  - **Tie-breaker:** Document ID (`compareCodePoint(left.id, right.id) * factor`), matching `.orderBy(FieldPath.documentId(), dir)` in both `ASC` and `DESC`.
  - **Order of operations:** Full sort occurs before pagination slicing.

### Index Changes ([firestore.indexes.json](../../backend-firebase/firestore.indexes.json))
- **Before:** `207` composite indexes (`7` over Firestore's default `200` quota).
- **Removed (`-56`):**
  - `1` redundant `payment_allocations` single-field index (`rentalChargeId: ASCENDING`).
  - `2` unused `suppliers` `nameNormalized` indexes (`isActive+nameNormalized ASC/DESC`).
  - `53` `rental_charges` `rentalId` composite indexes used only by `pageCharges` when `rentalId` was set.
- **Preserved (`151` total, `49` below the `200` quota):**
  - `[rentalId: ASCENDING, chargeSequence: ASCENDING]` (`chargesForRental`)
  - `[rentalId: ASCENDING, chargeSequence: DESCENDING]` (`generateNext`)
  - `[status: ASCENDING, currency: ASCENDING, rentalId: ASCENDING, dueDate: ASCENDING]` (`AUTO_FIFO` with `rentalId`)
  - All `48` non-`rentalId` `rental_charges` indexes (`{status, currency, customerId}` combinations).
  - All `rentals` (`34`), `payments` (`33`), `parts` (`11`), `stock_movements` (`6`), `suppliers` (`2`), `service_records` (`6`), `bikes` (`6`), and `customers` (`2`) indexes.

---

## 2. Regression Tests Added

- **[c3.unit.test.ts](../../backend-firebase/tests/c3.unit.test.ts):**
  - `compareCodePoint` (`'B' < 'a'`), `compareChargeTimestamps` nanosecond comparison, `filterAndSortRentalCharges` across `rentalId` + filters, numeric `chargeSequence`, nanosecond `createdAt`, `status` sorting, `ASC`/`DESC` document-ID tie-breaking, and sorting before pagination.
  - `RentalRepository.pageCharges` mock tests verifying `1,000` charges succeed (`totalElements === 1000`), `1,001` charges throw `422 UnprocessableEntityError`, and non-`rentalId` queries keep using `count()`.
- **[indexes.test.ts](../../backend-firebase/tests/indexes.test.ts):**
  - Asserts `parsed.indexes.length < 200` (`151`), verifies removal of `payment_allocations` & `suppliers.nameNormalized` indexes, verifies preservation of the 3 required `rentalId` indexes + all 48 non-`rentalId` `rental_charges` indexes, and keeps live emulator execution across all 16 `pageCharges` filter combinations × 4 sorts × 2 directions.
- **[rental.test.ts](../../backend-firebase/tests/rental.test.ts):**
  - Emulator integration tests seeding `1,000` charges for one rental (verifying `GET /api/v1/rental-charges?rentalId=...&status=...&currency=...&customerId=...&sort=chargeSequence,DESC` returns `200` with `totalElements === 500`), adding the `1,001`st charge (verifying `422`), and verifying non-`rentalId` `GET /api/v1/rental-charges` remains unbounded (`200`).

---

## 3. Verification Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm --prefix "backend-firebase" run typecheck` | **Passed** (`exit 0`) | `tsc --noEmit` completed with 0 errors. |
| `npm --prefix "backend-firebase" run build` | **Passed** (`exit 0`) | Compiled `dist/` cleanly. |
| `node --test dist/tests/env.test.js dist/tests/c3.unit.test.js dist/tests/payment.unit.test.js dist/tests/inventory.unit.test.js dist/tests/servicing.unit.test.js dist/tests/reports.unit.test.js dist/tests/bike-customer.unit.test.js dist/tests/indexes.test.js dist/tests/rental.test.js` | **46 tests: 44 passed, 0 failed, 2 skipped** | All unit tests and `firestore.indexes.json` schema/count (`151 < 200`) checks passed; the 2 emulator tests (`indexes.test.js` live query & `rental.test.js`) skipped without a running emulator. |
| `npm --prefix "backend-firebase" audit --omit=dev` | **Blocked in sandbox** (`ENOTFOUND registry.npmjs.org`) | Network access is disabled inside the sandbox. |

> **Important Note:** Emulator tests do not prove production Firestore composite-index availability. Run `npm run test:emulator` locally in PowerShell and validate `firebase deploy --only firestore:indexes` against a staging Firebase project before production deployment.

---

## 4. Remaining Compatibility Risks

1. **1,000-Charge-Per-Rental Limit on Route 30 with `rentalId`:** `GET /api/v1/rental-charges?rentalId=<id>` now fails with `422 UnprocessableEntityError` if a single rental exceeds `1,000` charges (~19.2 years of weekly billing), matching `chargesForRental`'s existing 1,000-charge limit (`409`).
2. **Quota Headroom:** `151` composite indexes leaves **49** spare slots under Firestore's default `200`-index limit.

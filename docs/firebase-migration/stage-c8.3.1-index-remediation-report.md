# Stage C8.3.1 – Firestore Composite Index Remediation Report

**Date:** 2026-11-16  
**Scope:** Remediation of missing Firestore composite indexes for `rentals` and `rental_charges` identified in [stage-c8.2-final-api-compatibility-review.md](stage-c8.2-final-api-compatibility-review.md).

---

## 1. Missing Indexes Identified & 106 Composite Indexes Added

Prior to Stage C8.3.1, [firestore.indexes.json](../../backend-firebase/firestore.indexes.json) contained **101** composite indexes (`14` on `rentals`, `18` on `rental_charges`, and `69` across other collections).

Stage C8.3.1 preserved all **101** existing indexes untouched and appended **106** missing composite indexes (new total: **207**, zero duplicates, zero repeated `fieldPath` entries within any single index):

1. **`rentals` (+20 added; `14` -> `34` total):**
   - **`createdAt` (`ASCENDING` & `DESCENDING`):** All 7 non-empty subsets of `{status, customerId, bikeId}` (**+14**).
   - **`status` (`ASCENDING` & `DESCENDING`):** All 3 non-empty subsets of `{customerId, bikeId}` (**+6**). This covers `{customerId}`, `{bikeId}`, `{customerId, bikeId}`, `{status, customerId}`, `{status, bikeId}`, and `{status, customerId, bikeId}` (since Firestore prohibits repeating `status` in both the equality prefix and trailing `orderBy` of one composite index).

2. **`rental_charges` (+86 added; `18` -> `104` total):**
   - **`dueDate` (`ASCENDING` & `DESCENDING`):** Completed all 15 non-empty subsets of `{status, currency, customerId, rentalId}` × 2 directions (**+15** added to the 15 pre-existing: 2-filter `DESCENDING` entries, `customerId+rentalId` `ASC/DESC`, remaining 3-filter `ASC/DESC`, and 4-filter `ASC/DESC`).
   - **`createdAt` (`ASCENDING` & `DESCENDING`):** All 15 non-empty subsets of `{status, currency, customerId, rentalId}` (**+30**).
   - **`chargeSequence` (`ASCENDING` & `DESCENDING`):** Completed all 15 non-empty subsets of `{status, currency, customerId, rentalId}` × 2 directions (**+27** added to the 3 pre-existing `[rentalId] ASC/DESC` and `[status, rentalId] ASC`).
   - **`status` (`ASCENDING` & `DESCENDING`):** All 7 non-empty subsets of `{currency, customerId, rentalId}` (**+14**), covering both non-`status` and `status`-filtered multi-filter queries.

---

## 2. Complete Supported Filter / Sort Coverage Matrix

### `GET /api/v1/rentals` (`RentalService.list` + `RentalRepository.pageRentals`)
- **Filters:** `{status, customerId, bikeId}` (`8` total subsets: `1` empty + `7` non-empty).
- **Sort Fields (`ASC` & `DESC`):** `startDate`, `createdAt`, `status`.
- **Coverage:**
  - Empty filter set (`{}`) + any `sortField` (`ASC`/`DESC`) -> **Single-field auto-index** (`fieldOverrides: []`).
  - `{status}` alone + `sort=status,ASC|DESC` -> **Single-field auto-index** on `status`.
  - All `7` non-empty filter subsets × `{startDate, createdAt}` × `{ASC, DESC}` -> **28 composite indexes** (100% covered).
  - All `6` multi-field / non-`status` subsets (`{customerId}`, `{bikeId}`, `{customerId, bikeId}`, `{status, customerId}`, `{status, bikeId}`, `{status, customerId, bikeId}`) × `status` × `{ASC, DESC}` -> **6 composite indexes** (100% covered).

### `GET /api/v1/rental-charges` (`RentalService.listCharges` + `RentalRepository.pageCharges`)
- **Filters:** `{status, currency, customerId, rentalId}` (`16` total subsets: `1` empty + `15` non-empty).
- **Sort Fields (`ASC` & `DESC`):** `dueDate`, `createdAt`, `chargeSequence`, `status`.
- **Coverage:**
  - Empty filter set (`{}`) + any `sortField` (`ASC`/`DESC`) -> **Single-field auto-index** (`fieldOverrides: []`).
  - `{status}` alone + `sort=status,ASC|DESC` -> **Single-field auto-index** on `status`.
  - All `15` non-empty filter subsets × `{dueDate, createdAt, chargeSequence}` × `{ASC, DESC}` -> **90 composite indexes** (100% covered).
  - All `14` remaining non-empty subsets (`7` non-`status` + `7` `status`-paired) × `status` × `{ASC, DESC}` -> **14 composite indexes** (100% covered).

---

## 3. Expanded `tests/indexes.test.ts` Coverage

Updated [indexes.test.ts](../../backend-firebase/tests/indexes.test.ts):
1. **Schema & Integrity Verification (`test('firestore.indexes.json schema and matrix verification')`):**
   - Asserts zero duplicate composite index definitions across the entire file.
   - Asserts zero duplicate `fieldPath` values within any single composite index.
   - Verifies all **34** `rentals` composite indexes (permuted equality prefix matching) and all **104** `rental_charges` composite indexes.
2. **Emulator Query Execution (`test('live execution of supported filter and sort queries on Firestore emulator')`):**
   - Exercises all `8` `rentals` filter subsets × `3` sort fields (`startDate`, `createdAt`, `status`) × `2` directions (`48` queries).
   - Exercises all `16` `rental_charges` filter subsets × `4` sort fields (`dueDate`, `createdAt`, `chargeSequence`, `status`) × `2` directions (`128` queries).

---

## 4. Verification Results

| Check | Result | Notes |
| --- | --- | --- |
| `npm --prefix "backend-firebase" run typecheck` | **Passed** (`exit 0`) | Verified after all edits (`tsc --noEmit`). |
| `npm --prefix "backend-firebase" run build` | **Passed** (`exit 0`) | Compiled `dist/` cleanly. |
| Offline unit + index schema suite (`node --test dist/tests/env.test.js dist/tests/payment.unit.test.js dist/tests/inventory.unit.test.js dist/tests/servicing.unit.test.js dist/tests/reports.unit.test.js dist/tests/bike-customer.unit.test.js dist/tests/indexes.test.js`) | **40 tests: 39 passed, 0 failed, 1 skipped** | All unit tests and the full `firestore.indexes.json` schema matrix passed; the 1 skipped test is the emulator test when no emulator is running. |
| `npm run test:emulator` (manual PowerShell execution by user) | **Passed (`Tests: 5, Passed: 5, Failed: 0, Cancelled: 0, Skipped: 0, Exit code: 0`)** | Emulator shutdown completed cleanly. |

---

## 5. Remaining Limitations & Index Notes

1. **Firestore 200-Index Default Quota:** Adding all `106` indexes brings [firestore.indexes.json](../../backend-firebase/firestore.indexes.json) to **207** composite indexes, which is **7 above** Google Cloud Firestore's default **200 composite indexes per database** limit. Deploying to a live Firebase project will require either requesting a composite-index quota increase or pruning low-frequency multi-filter `chargeSequence` indexes in a future pass if staying under 200.
2. **Emulator vs. Deployed Firestore:** The Firestore Emulator does **not** strictly enforce composite-index existence at runtime; deployed `FAILED_PRECONDITION` compliance is guaranteed here by the exhaustive static matrix checks in [indexes.test.ts](../../backend-firebase/tests/indexes.test.ts) and must still be validated upon deploying indexes to a staging Firebase project.
3. **Zero Unindexed `rentals` / `rental_charges` Combinations:** Every currently supported filter × sort × direction combination in `RentalService.list` and `RentalService.listCharges` is covered.

---

## 6. Modified Files (Stage C8.3.1)

- [firestore.indexes.json](../../backend-firebase/firestore.indexes.json)
- [indexes.test.ts](../../backend-firebase/tests/indexes.test.ts)
- [stage-c8.3.1-index-remediation-report.md](stage-c8.3.1-index-remediation-report.md)

---

## 7. Scope & Environment Confirmation

Confirmed that **no** files in `backend/` (Java backend), `mobile/` (Flutter app), `web/` (React app), `backend-firebase/src/`, production databases, or production Firebase resources/indexes were modified or deployed.

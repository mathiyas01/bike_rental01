# Stage C8.3.2 – Firestore Composite Index Quota Optimization Assessment

**Date:** 2026-11-16  
**Scope:** Read-only assessment of `backend-firebase/firestore.indexes.json` (`207` composite indexes) and query patterns in `backend-firebase/src/` to fit comfortably within Firestore's default **200 composite indexes per database** quota without restricting API filter or sort options.  
**Status:** Assessment Only — No indexes, code, tests, or client files were modified.

---

## 1. Current Composite Index Inventory (207 Total)

Per [firestore.indexes.json](../../backend-firebase/firestore.indexes.json) and [stage-c8.3.1-index-remediation-report.md](stage-c8.3.1-index-remediation-report.md):

| Collection Group | Index Count | Breakdown |
| :--- | :---: | :--- |
| `rentals` | **34** | `14` (`startDate`), `14` (`createdAt`), `6` (`status`) |
| `rental_charges` | **104** | `30` (`dueDate`), `30` (`createdAt`), `30` (`chargeSequence`), `14` (`status`) |
| `payments` | **33** | `30` (`{status, currency, paymentMethod, customerId}` × `paymentDate`), `2` (`rentalId+paymentDate`), `1` (`customerId+status`) |
| `parts` | **11** | `10` (`partCode` combinations), `1` (`isActive+isLowStock+currentQuantityMinor`) |
| `stock_movements` | **6** | `{partId, movementType}` × `createdAt` |
| `suppliers` | **4** | `isActive+name` (`ASC/DESC`), `isActive+nameNormalized` (`ASC/DESC`) |
| `service_records` | **6** | `{bikeId, status}` × `serviceDate` |
| `bikes` | **6** | `{isArchived, status}` × `createdAt` |
| `customers` | **2** | `isArchived` × `createdAt` |
| `payment_allocations` | **1** | `rentalChargeId: ASCENDING` |
| **Total** | **207** | **+7 over Firestore's default 200-index quota** |

---

## 2. Required vs. Redundant / Optimizable Indexes

### A. Immediately Redundant / Unused Indexes (**-3** Indexes, Zero Code Changes)
1. **`payment_allocations` (`rentalChargeId: ASCENDING`, `-1`):** `fieldOverrides` is `[]`, so Firestore automatic single-field indexing already indexes `rentalChargeId` in both directions. Declaring a single-field entry in `indexes[]` is redundant (and rejected by some `firebase deploy` validations).
2. **`suppliers` (`isActive + nameNormalized ASC/DESC`, `-2`):** `InventoryRepository.pageSuppliers` (`inventory.repository.ts:497-528`) and `parseSupplierSearchQuery` (`inventory.validation.ts:473`) only sort by `name`, `createdAt`, or `isActive` (`name` uses the composite index; `createdAt`/`isActive` use bounded scan). `nameNormalized` is never used in any `.orderBy()` query.

### B. `rental_charges` Indexes Combining `rentalId` with Other Filters (**-48** Indexes via `rentalId`-Scoped Query)
- Currently, **56** of `rental_charges`'s **104** composite indexes include `rentalId`:
  - `8` single-filter `rentalId` indexes (`dueDate`, `createdAt`, `chargeSequence`, `status` × `ASC`/`DESC` — `status` uses `{currency,customerId,rentalId}` subsets, so `rentalId+status` is in the `status` group)
  - **48** multi-filter indexes combining `rentalId` with `{status, currency, customerId}` across `dueDate`, `createdAt`, `chargeSequence`, and `status`!
- **Why these 48 are optimizable:** A single rental generates 1 charge per week (`~52/year`), and `RentalService.chargesForRental` (`rental.service.ts:531-538`) already caps a rental's charges at **1,000** (~19.2 years of weekly charges).
- Querying `.where('rentalId', '==', filters.rentalId).limit(1001)` (using Firestore's **single-field auto-index** on `rentalId`) and applying `status`/`currency`/`customerId` equality checks, sorting (`dueDate`/`createdAt`/`chargeSequence`/`status`), and slicing in memory eliminates **all 56** `rentalId` composite indexes except the **2** explicit non-paginated indexes (`rentalId + chargeSequence ASC` for `chargesForRental`, `rentalId + chargeSequence DESC` for `generateNext`, and `status + currency + rentalId + dueDate ASC` for `AUTO_FIFO` — note `rentalId + dueDate` is already covered if `dueDate` isn't needed or kept if desired; keeping `chargesForRental`/`generateNext`/`AUTO_FIFO` + dropping the 48 multi-filter `pageCharges` `rentalId` indexes saves **48** indexes cleanly!).

### C. Secondary Sort Fields (`createdAt`, `status`, Non-`rentalId` `chargeSequence`) (**Up to -84** Additional Indexes)
- `ServicingRepository.pageServices` (`servicing.repository.ts:321-348`), `InventoryRepository.pageParts` (`inventory.repository.ts:430-464`), and `InventoryRepository.pageStockMovements` (`466-495`) already restrict composite indexes to the **default sort field** (`serviceDate`, `partCode`, `createdAt`) and fall back to a bounded scan (`limit(1001)` -> `422 UnprocessableEntityError`) for secondary sorts.
- Applying that same bounded-scan pattern to secondary sorts in `RentalRepository` (`rentals`: `createdAt`, `status` = `-20`; `rental_charges`: `createdAt`, `status`, non-`rentalId` `chargeSequence` = `-51` after `B`) would reduce total indexes below **100**, at the trade-off of a 1,000-doc cap on secondary-sorted unfiltered/large-dataset queries.

---

## 3. Strategy Comparison

| Dimension | Strategy 1: Keep All 207 & Request Quota Increase | Strategy 2A (Recommended): `rentalId`-Scoped `pageCharges` + Unused Cleanup | Strategy 2B: Hybrid Primary-Indexed + Bounded-Scan Secondary Sorts |
| :--- | :--- | :--- | :--- |
| **Total Composite Indexes** | `207` (7 over default quota) | **`156`** (**44 below** 200 quota) | **`~98`** (**102 below** 200 quota) |
| **Code Changes Required** | None | Small localized change in `RentalRepository.pageCharges` + `firestore.indexes.json` + `tests/indexes.test.ts` | Medium change in `RentalRepository` (`pageRentals` & `pageCharges`) + `firestore.indexes.json` + `tests/indexes.test.ts` |
| **API Filter & Sort Support** | 100% preserved | **100% preserved** | 100% preserved (with `422` above 1,000 docs on secondary sorts) |
| **Scale > 1,000 Docs** | Unbounded across all queries | Unbounded for all `rentals` queries and all `rental_charges` queries without `rentalId` (and <=1,000 charges per single rental) | Unbounded for default sorts (`startDate`, `dueDate`); capped at 1,000 docs (`422`) on secondary sorts |
| **Query Latency / Cost** | Uses `count()` + `startAfter` loop | Faster (1 read instead of `count()` + `startAfter` when `rentalId` is set) | Faster for secondary sorts <=1,000 docs; `422` above 1,000 |
| **Deployment Friction** | Blocked until GCP quota increase approved on every environment | **Deployable immediately** to any standard Spark/Blaze Firebase project | **Deployable immediately** with >100 spare index slots |

---

## 4. Impact on All Supported Queries

Under the recommended **Strategy 2A**:
1. **`GET /api/v1/rentals` (all 8 filter subsets × 3 sorts × 2 directions):** Zero impact; all 34 `rentals` composite indexes remain intact.
2. **`GET /api/v1/rental-charges` without `rentalId` (8 filter subsets × 4 sorts × 2 directions):** Zero impact; all `dueDate`, `createdAt`, `chargeSequence`, and `status` composite indexes for `{status, currency, customerId}` remain intact.
3. **`GET /api/v1/rental-charges` with `rentalId` (8 filter subsets × 4 sorts × 2 directions):** Uses single-field `.where('rentalId', '==', rentalId).limit(1001)`, filters `status`/`currency`/`customerId` and sorts in memory, returning identical `PageResponse<RentalChargeDto>` output (and exact `totalElements`).
4. **`chargesForRental`, `generateNext`, `dueCharges`, `AUTO_FIFO` payments:** Zero impact; dedicated composite indexes (`[rentalId, chargeSequence ASC/DESC]`, `[status, dueDate ASC]`, `[status, currency, customerId, dueDate ASC]`, `[status, currency, rentalId, dueDate ASC]`) remain untouched.
5. **`payment_allocations` & `suppliers`:** Removing the 3 unused/redundant indexes has zero runtime impact.

---

## 5. Recommended Implementation Plan (For Future Execution)

1. **Clean up unused/redundant indexes (`-3`):** Remove `payment_allocations` (`rentalChargeId: ASCENDING`) and `suppliers` (`isActive + nameNormalized ASC/DESC`) from `firestore.indexes.json` and update `tests/indexes.test.ts` assertions.
2. **Scope `rentalId` queries in `RentalRepository.pageCharges` (`-48`):** When `filters.rentalId` is defined, query `.where('rentalId', '==', filters.rentalId).limit(1001)` (throwing `409 OperationalError` / `422 UnprocessableEntityError` if `> 1000`, consistent with `chargesForRental`) and perform `status`/`currency`/`customerId` filtering, sorting, and pagination slicing in memory.
3. **Prune the 48 `rentalId` multi-filter `pageCharges` indexes** from `firestore.indexes.json` (retaining `[rentalId, chargeSequence ASC/DESC]` and `[status, currency, rentalId, dueDate ASC]` for `chargesForRental`/`generateNext`/`AUTO_FIFO`).
4. **Update `tests/indexes.test.ts`:** Update the matrix assertion to verify all remaining `156` indexes and test `pageCharges` with `rentalId` + all filter/sort combinations against the Firestore Emulator.
5. **Re-verify:** Run `typecheck`, `build`, unit tests, and `npm run test:emulator`.

---

## 6. Remaining Risks

1. **Single Rental > 1,000 Charges:** A rental spanning >1,000 weekly charges (~19.2 years) would hit the 1,000-charge read cap (already an existing limit in `RentalService.chargesForRental`).
2. **Future Feature Headroom:** `156` indexes leaves **44** free composite-index slots under the default `200` quota. If future modules add many new composite indexes, Strategy 2B (`rentals` / `rental_charges` secondary-sort bounded scans) can be applied later to free ~58 more slots.
3. **Deployed Firestore Verification:** Because the Firestore Emulator does not enforce composite-index errors, index validity and quota compliance must still be verified via `firebase deploy --only firestore:indexes` against a staging Firebase project.

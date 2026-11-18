# Stage C8.4.4.1 – Atomic Rental Charge Generation (Option A)

## Summary
Refactored `RentalService.generateUpToDate()` in `backend-firebase/src/rental/rental.service.ts` to execute inside a single `firestore.runTransaction(...)` (Option A from the C8.4.4 assessment), matching Java's `@Transactional` all-or-nothing guarantee up to Firestore's 500-write transaction ceiling.

## Implementation Details
- **Single-transaction reads before writes:** `RentalService.generateUpToDate()` reads `rentals/{rentalId}`, `rental_charge_cursors/{rentalId}` (falling back to `orderBy('chargeSequence', 'desc').limit(1)` when the cursor is missing), and all planned deterministic `rental_charges/{rentalId}_{sequence}` references via `transaction.getAll(...)` before performing any writes.
- **Pre-flight planning and validation:** All required weekly periods up to `targetDate` (respecting `rental.status === 'CANCELLED'` and `actualClosedDate` boundaries) are calculated in memory before any write.
- **Zero-write no-op & 499-charge atomic ceiling:**
  - If 0 charges are due, the transaction exits without writes and returns `[]`.
  - If more than `MAX_ATOMIC_GENERATED_CHARGES` (`499`) new charges are required, `OperationalError` (HTTP `409 Conflict`) is thrown before any writes, leaving `rental_charges` and `rental_charge_cursors` unchanged.
- **Atomic commit:** For 1–499 charges, all missing deterministic charge documents (`<= 499`) and the `rental_charge_cursors/{rentalId}` update (`1`) are committed in the same transaction (`<= 500` writes total).

## Limitations
- A single `POST /api/v1/rental-charges/rental/:rentalId/generate-up-to-date` request is capped at **499 new charges** (~9.56 years of weekly charges per call) due to Firestore's 500-write-per-transaction limit. Callers spanning more than 499 ungenerated weeks must invoke the endpoint in bounded `targetDate` increments.

# Stage B: PostgreSQL to Firestore migration plan

## Safety principles

The Neon PostgreSQL database remains read-only and available throughout
migration, verification, dual-run, and rollback. No `DELETE`, `UPDATE`, schema
change, Flyway change, or destructive export runs against the source. Take a
provider backup/snapshot and export a checksum manifest before importing.

The migration tool is an offline TypeScript/Node process using a read-only
PostgreSQL account and Firebase Admin SDK credentials available only in the
migration environment. It is not a public Cloud Function endpoint.

## Export and transformation

1. Record source schema/migration versions and a consistent export watermark.
2. Export all 15 tables in foreign-key-safe order:
   `app_users`, customers, bikes, suppliers, parts, rentals,
   rental_charges, payments, payment_allocations, payment_reversals,
   rental_adjustments, service_records, service_part_usage, stock_movements,
   business_settings.
3. Stream rows in bounded batches; never load the entire database into memory.
4. Preserve UUID values as Firestore document IDs and relationship fields.
5. Convert SQL `DATE` to validated `YYYY-MM-DD` strings and `TIMESTAMPTZ` to
   UTC Firestore timestamps/ISO output.
6. Convert `NUMERIC` values through decimal strings, preserving scale and
   currency; never parse through a JavaScript number.
7. Normalize unique lookup values (email, phone, registration, VIN, part code)
   only for lock keys; preserve original display values.
8. Preserve nulls, enum values, archive flags, status values, notes, audit
   users, historical timestamps, and source IDs.
9. Create supporting lock documents only after validating their owners.

## Import order and checkpoints

Each batch has a checkpoint containing table, last primary key/cursor, source
row count, destination write count, checksum, start/end time, and error list.
The importer is resumable and idempotent: a deterministic document ID is
upserted only when the source checksum matches or the destination is absent.
Conflicting destination content stops the import for manual review.

Recommended order:

1. `app_users`, `business_settings`
2. customers, bikes, suppliers
3. parts and initial quantity/stock movement history
4. rentals and active rental locks
5. rental charges
6. payments, allocations, reversals
7. rental adjustments
8. service records, part usage, service movements
9. summary counters and denormalized display snapshots

Use BulkWriter for independent import batches with retry and per-document
failure reporting. Do not use BulkWriter to implement live rental/payment/
inventory transactions.

## Validation and duplicate handling

Before writing a table, validate required fields, enum values, currency codes,
foreign-key references, decimal scale/range, and source uniqueness. Preserve
invalid rows in a quarantine report with primary key and reason; do not
silently coerce or drop them. An import is not complete while quarantined rows
could affect an API workflow.

For duplicate unique values, stop the affected batch and report both source
IDs. Do not select a winner automatically. Existing UUID collisions with
different content are fatal and require a new destination project or explicit
approval.

## Verification

Compare source and destination:

- row/document counts for every table/collection;
- UUID sets and foreign-key/reference resolution;
- null and archive/status distributions;
- per-currency sums for charges, confirmed payments, allocations, labour,
  parts usage, stock movement costs, and adjustments;
- rental active-lock count and bike status consistency;
- part quantity against the signed movement ledger;
- payment allocation totals and charge paid/remaining/status values;
- service part usage and bike odometer/next-service values;
- report outputs for fixed date ranges and bike fixtures.

Run read-only reconciliation queries against Neon and equivalent Firestore
reconciliation functions. Preserve a signed migration report and manifests.

## Mandatory migration rehearsal

Before any production migration, run the importer against a sanitized,
immutable copy of the PostgreSQL database (or a provider snapshot restored to
a separate rehearsal instance). The rehearsal must use a separate Firebase
project/database and must not connect to or write the live Neon database.
Repeat the rehearsal from a clean destination and from each recorded
checkpoint to prove resumability and idempotence.

Acceptance requires all 15 source tables and corresponding Firestore
collections to pass:

1. exact row/document counts and UUID set equality;
2. every foreign-key relationship resolves to the preserved UUID;
3. unique values and deterministic hashed locks have one owner with original
   normalized values recorded;
4. archive flags, statuses, nulls, dates, timestamps, notes, and historical
   audit users match;
5. rental active locks match active rentals and bike statuses;
6. charge totals, paid amounts, remaining balances, and statuses reconcile;
7. payment totals, allocation totals, currencies, and reversal records
   reconcile per payment/customer/rental;
8. stock quantities equal the signed movement ledger, including fractional
   quantity scale;
9. service records, part usage, service movements, labour/parts costs, bike
   odometers, and due dates match;
10. rental adjustments and business settings are present even without current
    public controllers;
11. fixed dashboard, utilization, date-range, and bike-ROI fixtures match the
    approved Java behavior, including the known ROI lookup defect;
12. repeated import produces zero content differences and no duplicate locks.

The rehearsal is a mandatory exit gate. A failed count, UUID, relationship,
financial, stock, historical-record, or report check blocks Stage C cutover
planning and requires quarantine/manual review.

## Incremental/dual-run strategy

The safest initial plan is a maintenance-window snapshot followed by a
read-only verification period, because the current Java system has no change
data capture. If near-zero downtime is required, add an explicitly approved
outbox/change-capture mechanism before migration; do not infer changes from
timestamps alone for financial records.

During dual-run, Java remains the source of truth. Firebase receives imported
data and read-only compatibility tests. Only after reconciliation and approval
would writes be switched, with a final delta export and freeze.

## Backup and rollback

- Retain Neon backup and credentials until post-cutover acceptance.
- Retain immutable export files/checksums in restricted storage.
- Snapshot Firestore before any rehearsal or cutover.
- Rollback means route traffic back to Java and discard/retain the Firebase
  project for analysis; never attempt an automatic reverse write into Neon.
- If Firebase writes occurred after cutover, reconcile them explicitly before
  any later retry. Financial records are not deleted as a rollback shortcut.

## Limitations

Without source change capture, continuous migration cannot guarantee no missed
writes. Firestore denormalization and summary counters also require a
post-import rebuild and reconciliation. The migration is complete only after
all 15 collections, supporting locks, historical records, and financial
calculations reconcile.

# Stage B: Firestore data model

## General rules

- Use the existing UUID string as the document ID for every migrated primary
  record.
- Store `LocalDate` values as validated `YYYY-MM-DD` strings so the REST
  contract and date-only semantics remain stable.
- Store `Instant` values as Firestore timestamps internally and serialize them
  as ISO instants in DTOs.
- Store money as canonical decimal strings and quantities as canonical decimal
  strings. Use integer minor units only in explicitly separate derived
  counters; never use JavaScript floating point for financial logic.
- Keep immutable historical documents; archive flags/statuses replace deletion.
- References are UUID fields, with selected display fields denormalized for
  response DTOs and report reads.

## Collections

| Collection / ID | Fields and relationships | Queries, indexes, uniqueness |
|---|---|---|
| `app_users/{userId}` | `email`, `emailNormalized`, `passwordHash`, `fullName`, `role`, `preferredLanguage`, `preferredCurrency`, `isActive`, `authVersion`, `tokenIssuedBefore`, `createdAt`, `updatedAt` | Unique email lock; profile by ID; login by normalized email. Never expose `passwordHash`. |
| `customers/{customerId}` | `fullName`, `phone`, `phoneNormalized`, `email`, `cnpOrTaxId`, `dateOfBirth`, `livingCity`, licence fields, `address`, `gdprConsentDate`, `notes`, `isArchived`, timestamps | Unique phone lock; search normalized name/phone; archived + createdAt index. Financial history references customer ID. |
| `bikes/{bikeId}` | registration/VIN, make/model, manufacture year, odometer decimal, ITP/RCA/CASCO dates, service interval/next date, `status`, notes, `isArchived`, timestamps | Unique registration and VIN locks; status + createdAt; status + archived. Active rental lock is separate. |
| `suppliers/{supplierId}` | name/contact/phone/email/tax/address/notes, `isActive`, `isArchived` compatibility field if imported, `createdAt`, `updatedAt` | name + active/archive sort; parts retain nullable supplier ID. Preserve both source active semantics and response `active`. |
| `parts/{partId}` | code/name/category/description/unit, `currentQuantity`, `minReorderLevel`, default cost/currency, supplier ID/name, `isActive`, `createdAt`, `updatedAt` | Unique part code lock; category + code; active + code. Low stock uses a maintained `isLowStock` field updated with quantity. |
| `rentals/{rentalId}` | customer/bike IDs plus display snapshots, dates, rate/currencies, deposit, frequency, anchor, status, terms, timestamps | status + startDate; customer + startDate; bike + startDate. Active bike constraint uses `active_rental_locks/{bikeId}`. |
| `rental_charges/{chargeId}` | rental ID, customer/bike denormalized IDs, sequence, period/due dates, amount/currency, status, paidAmount, remainingAmount, notes, timestamps | Unique deterministic ID `{rentalId}_{sequence}` or sequence lock; rental + sequence; status + dueDate; customer + currency + status + dueDate. |
| `payments/{paymentId}` | customer/rental IDs and customer display, payment date, amount/currency, method, reference/notes, status, recorder ID/name, allocations summary, reversal fields, timestamps | customer + paymentDate; rental + paymentDate; status + paymentDate; currency + paymentDate. Allocations remain separate immutable child records. |
| `payment_allocations/{allocationId}` | payment ID, charge ID, customer/rental IDs, sequence/due-date snapshot, amount/currency, allocatedAt | charge + allocatedAt; payment + allocatedAt; payment ID deterministic child key for idempotent writes where request ID is available. |
| `payment_reversals/{paymentId}` | payment ID as unique ID, reason, reversedByUserId/name, reversedAt | One reversal per payment enforced by document ID and transaction. |
| `rental_adjustments/{adjustmentId}` | rental/optional charge IDs, type, amount/currency, reason, creator ID, createdAt | rental + createdAt; charge + createdAt. Preserve table even though no current controller exposes it. |
| `service_records/{serviceId}` | bike ID/display, service date, odometer, provider/work, labour cost/currency, status, due date/odometer, notes, partsCost/totalCost, timestamps | bike + serviceDate; status + serviceDate; due date/status. |
| `service_part_usage/{usageId}` | service ID, bike ID, part ID/display, quantity, unit cost/currency, totalCost, createdAt | service + createdAt; part + createdAt. Immutable after service completion. |
| `stock_movements/{movementId}` | part ID/display, signed quantityDelta, type, reference type/ID, cost/currency, reason, recorder ID/name, createdAt, idempotency key | part + createdAt; type + createdAt; reference ID + type. Immutable. |
| `business_settings/{settingKey}` | `settingValue`, `updatedAt`, optional typed metadata | Key lookup. Preserve text values exactly; only server owner code may update. |

Supporting collections:

- `active_rental_locks/{bikeId}`: rental ID, status, version, createdAt. A
  document exists only for an active allocation and is created/deleted in the
  rental transaction.
- `unique_keys/{fieldType}_{sha256(normalizedValue)}`: `fieldType`,
  original `normalizedValue`, owning `recordId`, and `createdAt`. The path
  contains only a deterministic SHA-256 hash, never a raw normalized value.
  Creation is transactionally conditional; never rely on a query-only
  uniqueness check.
- `summary_counters/{summaryId}`: bounded counters and per-currency totals
  for reports, with `sourceVersion` and reconciliation metadata.
- `idempotency_keys/{operation}_{clientKey}`: request fingerprint, result
  reference/status, createdAt, and expiry. Use only where the client can send
  or the server can derive a stable replay key; do not invent a required
  request field in the public contract.

## Relationships and denormalization

References preserve all foreign-key relationships without embedding unbounded
children. Customer, bike, rental, part, and user display values are copied
into response-oriented documents where the Java DTO needs names in a single
response. The source IDs remain authoritative. A repair/reconciliation job
refreshes display snapshots after edits.

Payment allocations, service usage, and stock movements are separate
collections because their histories can grow and must remain auditable.

## Index plan

The exact generated index file belongs to Stage C after emulator query tests.
The required families are:

- archived/status + createdAt for bikes, customers, parts, suppliers;
- customer/bike/status + date for rentals;
- rental/customer/status/currency + dueDate for charges;
- customer/rental/status/currency + paymentDate for payments;
- part/type/reference + createdAt for movements;
- bike/status + serviceDate and due-date queries for services;
- rental/charge IDs + createdAt for allocations and adjustments.

Each query must have a deterministic tie-breaker (`__name__`) and a bounded
page. Composite index proliferation should be avoided by using normalized
read models for high-frequency report queries.

## Uniqueness and archive behavior

Firestore queries cannot atomically enforce SQL unique constraints. Every unique field uses a deterministic
`unique_keys/{fieldType}_{sha256(normalizedValue)}` lock in the same
transaction as the record create/update. The lock stores the field type,
original normalized value for collision diagnostics, owner record ID, and
creation timestamp. If a hash path already exists, the transaction compares
the stored normalized value and owner: the same owner is idempotent, a
different owner with the same normalized value is a uniqueness conflict, and a
different normalized value is a hash-collision integrity failure that stops
the operation. On update, reserve the new lock, verify it is owned by the
record, update the record, then release the old lock only if its owner still
matches. Archive does not release locks because PostgreSQL uniqueness remains
in force across archived rows. Delete/release is permitted only for an
explicit record deletion workflow, which the current API does not expose.

Archive operations update the existing document and retain all history.
Archived customers/bikes/parts/suppliers are excluded by default but included
when `includeArchived=true`. Existing rental, charge, payment, service, and
movement documents are never cascaded or deleted.

## Data-model limitations

The relational `rental_adjustments` table is not exposed by the current API but
must be migrated. Firestore cannot enforce all foreign keys; service-layer
validation and reconciliation must reject new dangling references. A
transaction cannot safely read an unlimited number of charges or parts, so
FIFO allocation and service usage must have explicit maximums or use a
reservation/workflow design before accepting unusually large requests.

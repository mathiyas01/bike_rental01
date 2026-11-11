# Stage C3: Rental and charge workflow implementation specification

## Status and scope

This document was the implementation specification for the next application
stage after C2.1. Stage C3 implementation is now complete for the approved
scope; the implementation result and verification status are recorded below.

Stage C3 is restricted to:

- rental creation, closure, update, detail, and paginated listing;
- recurring rental charge generation and charge reads;
- the supporting bike/customer reads and mutations required to preserve the
  Java rental workflow;
- Firestore transaction, locking, pagination, validation, and emulator tests
  for those workflows.

It must not implement payments, inventory, servicing, reports, migration
imports, frontend changes, production credentials, or production deployment.

## Roadmap decision

The Stage B roadmap defines C3 as **Rental and charge workflows**:

- active-rental locks;
- rental creation, closure, update, list, and detail;
- deterministic charge sequence creation and bounded generation;
- emulator contention and duplicate-request tests.

The C3 exit gate is that the one-active-rental invariant holds under concurrent
requests and all 15 rental/charge routes match status and response fixtures.

The inspection found that the current Firebase project has not yet implemented
the C2 reference repositories listed in the roadmap. Current Firebase routes
are:

- `GET /health`;
- the six authentication routes under `/api/v1/auth`.

Current Firebase collections accessed by source code are `app_users` and
`unique_keys`. There is no implemented pagination helper, rental transaction
helper, bike repository, customer repository, rental repository, charge
repository, or shared decimal utility. Therefore C3 must begin with the
reference-data prerequisite work described below. This is not permission to
implement unrelated C2 modules; only the minimum bike/customer capabilities
needed by the rental contracts are in scope.

## Preconditions and dependencies

### Required before C3 coding

1. C2.1 authentication remains emulator-only and production compatibility
   remains explicitly unverified.
2. Owner authentication middleware is reused for every C3 route.
3. `bikes` and `customers` Firestore documents and repositories exist with
   preserved UUID document IDs.
4. Bike/customer DTO mapping and validation are available, or are implemented
   as the minimum prerequisite slice.
5. A shared canonical decimal-string utility is available. JavaScript
   floating-point arithmetic is prohibited for weekly rates, deposits, charge
   amounts, paid amounts, and remaining amounts.
6. A shared date-only utility validates and serializes `YYYY-MM-DD` values.
7. A shared Java-compatible error response mapper is available.
8. A shared cursor/page adapter defines the Java-compatible
   `{content,pageNumber,pageSize,totalElements,totalPages,last}` envelope.
9. Emulator seed fixtures can create owner, customer, available bike, and
   existing rentals/charges with stable UUIDs.

### Explicitly not a prerequisite

- Production JWT or BCrypt fixtures. Those remain a later compatibility gate.
- PostgreSQL export or import.
- Flutter or React changes.
- Payment, inventory, servicing, or report implementation.

## Authoritative Java references

The implementation must be checked against the following files before each
workflow is coded:

- `backend/src/main/java/ro/bikerental/modules/rental/controller/RentalController.java`
- `backend/src/main/java/ro/bikerental/modules/rental/service/RentalService.java`
- `backend/src/main/java/ro/bikerental/modules/rental/controller/RentalChargeController.java`
- `backend/src/main/java/ro/bikerental/modules/rental/service/RentalChargeService.java`
- `backend/src/main/java/ro/bikerental/modules/rental/entity/Rental.java`
- `backend/src/main/java/ro/bikerental/modules/rental/entity/RentalCharge.java`
- `backend/src/main/java/ro/bikerental/modules/rental/dto/CreateRentalRequest.java`
- `backend/src/main/java/ro/bikerental/modules/rental/dto/UpdateRentalRequest.java`
- `backend/src/main/java/ro/bikerental/modules/rental/dto/CloseRentalRequest.java`
- `backend/src/main/java/ro/bikerental/modules/rental/dto/RentalDto.java`
- `backend/src/main/java/ro/bikerental/modules/rental/dto/RentalChargeDto.java`
- `backend/src/main/java/ro/bikerental/modules/rental/entity/RentalStatus.java`
- `backend/src/main/java/ro/bikerental/modules/rental/entity/ChargeStatus.java`
- bike/customer entities, repositories, services, controllers, and DTOs;
- `backend/src/main/java/ro/bikerental/common/pagination/PageResponse.java`;
- `backend/src/main/java/ro/bikerental/common/exception/GlobalExceptionHandler.java`.

The Stage A matrix remains authoritative for public contracts:
[api-compatibility-matrix.md](./api-compatibility-matrix.md).

## API surface to implement

All routes require a valid authenticated owner token. No new public route,
request field, response field, or idempotency field may be added.

| # | Method and path | Request/query | Success |
|---:|---|---|---|
| 21 | `POST /api/v1/rentals` | `CreateRentalRequest` | `201 RentalDto` |
| 22 | `POST /api/v1/rentals/{id}/close` | `CloseRentalRequest` | `200 RentalDto` |
| 23 | `PUT /api/v1/rentals/{id}` | `UpdateRentalRequest` | `200 RentalDto` |
| 24 | `GET /api/v1/rentals/{id}` | UUID path | `200 RentalDto` |
| 25 | `GET /api/v1/rentals` | `status`, `customerId`, `bikeId`, `page`, `size`, `sort` | `200 PageResponse<RentalDto>` |
| 26 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-next` | none | `201 RentalChargeDto` |
| 27 | `POST /api/v1/rental-charges/rental/{rentalId}/generate-up-to-date` | required `targetDate` | `201 RentalChargeDto[]` |
| 28 | `GET /api/v1/rental-charges/rental/{rentalId}` | UUID path | `200 RentalChargeDto[]` |
| 29 | `GET /api/v1/rental-charges/due` | optional `asOfDate` | `200 RentalChargeDto[]` |
| 30 | `GET /api/v1/rental-charges` | `status`, `currency`, `customerId`, `rentalId`, `page`, `size`, `sort` | `200 PageResponse<RentalChargeDto>` |

### Request rules

`CreateRentalRequest` requires `customerId`, `motorbikeId`, `startDate`,
`weeklyRate >= 0.01`, and currency `RON`, `EUR`, or `USD`. Deposit defaults to
zero and deposit currency defaults to the rental currency. `plannedEndDate`
is optional. `scheduleAnchorDay` defaults to `START_DAY`.

`UpdateRentalRequest` requires `motorbikeId`, `startDate`, `weeklyRate >=
0.01`, and a supported currency. Deposit is optional and defaults as Java
does. The planned end date cannot precede the requested start date.

`CloseRentalRequest` requires `closureDate`; closure notes are optional.
Closure before the rental start date is rejected.

`generate-up-to-date` requires an ISO date query value. Missing or invalid
dates are validation failures, not an unbounded generation request.

### Response DTOs

`RentalDto` must contain exactly the Java-compatible fields:
`id`, `customerId`, `customerName`, `customerPhone`, `bikeId`,
`bikeRegistrationNumber`, `bikeMakeModel`, `startDate`, `plannedEndDate`,
`actualClosedDate`, `weeklyRate`, `currency`, `depositAmount`,
`depositCurrency`, `paymentFrequency`, `scheduleAnchorDay`, `status`,
`termsAndNotes`, and `createdAt`.

`RentalChargeDto` must contain exactly:
`id`, `rentalId`, `chargeSequence`, `periodStartDate`, `periodEndDate`,
`dueDate`, `amount`, `currency`, `status`, `paidAmount`,
`remainingAmount`, `notes`, and `createdAt`.

Charge `paidAmount` is the sum of payment allocations for the charge. Payments
are not implemented in C3, so seeded allocation fixtures may be used for
read-contract tests; C3 must not invent payment writes. `remainingAmount` is
the non-negative decimal amount minus paid amount, matching Java.

## Firestore data and relationships

### Existing/reference collections required

`customers/{customerId}` and `bikes/{bikeId}` use existing UUIDs as document
IDs. They must preserve archive/status fields and timestamps. C3 reads these
documents transactionally and returns denormalized display snapshots in
rentals.

### Rental collection

`rentals/{rentalId}` uses a UUID document ID and stores:

- `customerId`, `customerName`, `customerPhone`;
- `bikeId`, `bikeRegistrationNumber`, `bikeMakeModel`;
- `startDate`, `plannedEndDate`, `actualClosedDate`;
- canonical decimal strings `weeklyRate`, `depositAmount`;
- `currency`, `depositCurrency`;
- `paymentFrequency: "WEEKLY"`;
- `scheduleAnchorDay`, `status`, `termsAndNotes`;
- `createdAt`, `updatedAt`.

Source IDs are authoritative. Denormalized display fields are response
snapshots and must be refreshed only through an approved repair path; C3
should not silently rewrite unrelated historical rentals when a customer or
bike name changes.

Required query families are status/start date, customer/start date,
bike/start date, and deterministic tie-breaking by document ID.

### Rental charge collection

`rental_charges/{rentalId}_{sequence}` uses a deterministic document ID.
It stores `rentalId`, customer/bike IDs, `chargeSequence`,
`periodStartDate`, `periodEndDate`, `dueDate`, canonical decimal `amount`,
`currency`, `status`, `paidAmount`, `remainingAmount`, `notes`, and
timestamps.

The deterministic ID and sequence lock prevent duplicate sequences under
retries. The unique relational constraint `(rental_id, charge_sequence)` is
preserved. A separate cursor document may be used if every sequence operation
reads and updates it in the same transaction:
`rental_charge_cursors/{rentalId}` with `nextSequence` and last-period data.

Required query families are rental/sequence, status/due date, and
customer/currency/status/due date. Indexes must be generated from emulator
query tests rather than guessed and committed prematurely.

### Active rental lock

`active_rental_locks/{bikeId}` exists only for an active allocation and stores
`rentalId`, `status`, `version`, and `createdAt`. Its document ID is the bike
UUID. Creation, verification, and deletion are transactionally tied to the
rental and bike documents.

## Workflow specifications

### Rental creation

Read before any write in one Firestore transaction:

1. customer document;
2. bike document;
3. `active_rental_locks/{bikeId}`;
4. deterministic rental/charge references if an optional replay identity is
   available.

Validate that the customer and bike exist, are not archived, the bike is
`AVAILABLE`, and no active lock exists. Normalize supported currencies and
construct a `WEEKLY`, `ACTIVE` rental. Write the rental, active lock, bike
status `RENTED`, and initial charge sequence `1`.

The initial charge period is `startDate` through `startDate + 6` days, due on
`startDate`, with the Java-compatible initial note. All money calculations
use decimal strings and explicit scale-two rounding.

Two concurrent requests for one bike must serialize on the active lock. One
must commit and the other must return the Java-compatible conflict. A
transaction retry must not create another rental, charge, or lock.

### Rental closure

Read rental, referenced bike, and active lock before writes. Require rental
status `ACTIVE` and closure date not earlier than start date. Append the Java
closure note format to existing terms/notes when notes are supplied. Set
status `CLOSED` and `actualClosedDate`.

Set the bike to `AVAILABLE` only when its current status is `RENTED`. Delete
the active lock only when it belongs to this rental. Do not cancel future
charges or delete charge history. A missing/mismatched lock must result in a
conflict or integrity error, not an unrelated lock deletion.

### Rental update

Read rental and its current bike. Require rental status `ACTIVE`. If the bike
changes, read the new bike and its active lock before writes; require the new
bike to be available, unarchived, and not actively rented. In one transaction:

- release the previous bike only if it is still assigned and rented;
- assign the new bike and set it to `RENTED`;
- update the rental fields and timestamps;
- preserve the active-rental lock invariant.

Validate planned end versus start date and preserve Java currency/default
normalization. Do not regenerate or silently rewrite existing charges unless
the Java service does so; the current Java update method must be read through
to its completion before implementation is approved.

### Charge generation

`generate-next` reads the rental and sequence/cursor state before writing.
Reject cancelled rentals. Compute the next sequence from the highest existing
sequence/cursor, period start from the previous period end plus one day,
period end plus six days, and due date equal to period start. Reject a next
period after `actualClosedDate`.

Create the deterministic charge document and advance the cursor atomically.
A retry that sees the same sequence returns the existing charge rather than
creating a duplicate.

`generate-up-to-date` must not use one unbounded transaction. Repeatedly call
bounded `generate-next` transactions until target date or closure date is
reached. Return only charges generated by this call, in ascending sequence
order. A target before the next period returns an empty list.

### Charge reads

Rental charge reads enrich each charge with paid and remaining values from
seeded allocation data without changing charge history. Due reads include only
`UNPAID` and `PARTIALLY_PAID` charges whose due date is on or before the
requested/default current date, matching the Java query. Paginated reads
preserve default `dueDate,ASC` and stable tie-breaking.

## Pagination and sorting

Implement a shared adapter that accepts Java page parameters and emits the
exact page envelope. Defaults:

- rentals: page `0`, size `20`, sort `startDate,DESC`;
- charges: page `0`, size `20`, sort `dueDate,ASC`.

Validate page and size bounds. Never use offset scans over an unbounded
collection. Use cursor pagination internally with a deterministic composite
ordering and document-ID tie-breaker, while preserving the externally
observed page fields. If exact `totalElements`/`totalPages` requires a count
read, make that cost explicit and test it against Java fixtures.

Unsupported sort properties or directions must produce the repository-standard
validation response rather than silently selecting a different field.

## Authorization and error behavior

All C3 routes use the existing authentication middleware and owner
authorization middleware. The user ID from the verified token is not accepted
from request bodies or query strings.

Preserve Java status categories:

- `400` validation failures with `ErrorResponse` and field errors;
- `401` missing, malformed, expired, revoked, or invalid tokens;
- `403` authenticated non-owner access where applicable;
- `404` missing rental, charge, bike, or customer;
- `409` bike allocation and uniqueness/concurrency conflicts;
- `500` only for unexpected failures.

Exact Java business messages must be captured in differential fixtures before
the implementation is declared compatible.

## Transaction limits and retry behavior

Rental creation and closure are bounded small transactions. Charge
`generate-next` is one rental, one cursor/sequence state, and one charge
transaction. `generate-up-to-date` is a sequence of bounded transactions,
not one transaction proportional to the number of weeks.

Every transaction must read all documents that affect its writes before its
first write, contain no network calls, and be safe for Firestore retries.
Use deterministic IDs for rental charges and locks. Retry only Firestore
contention/aborted errors with a finite policy. Map exhausted contention to a
conflict/operational error without partial success.

If a client retry has no stable request identity, the service must not claim
semantic idempotency. Optional server-derived idempotency may be added only
when the fingerprint is stable and cannot merge distinct legitimate requests.

## Required tests

### Unit tests

- Request validation for every required/optional rental and charge field.
- Decimal-string normalization, scale-two rounding, zero deposit defaults,
  currency normalization, and date-only parsing.
- Rental and charge DTO field names, nullability, and enum serialization.
- Page defaults, filters, stable sort tie-breakers, invalid sort, and bounds.
- Initial charge dates, sequence, amount, currency, and note.
- Closure note formatting and no future-charge cancellation.
- Charge remaining amount with zero, partial, and over-allocation fixtures.
- Cancelled-rental and post-closure charge-generation rejection.
- Error mapping for validation, not-found, conflict, unauthorized, and
  unexpected errors.

### Firestore Emulator integration tests

- Create rental with customer and available bike.
- Reject archived customer and archived bike.
- Reject unavailable bike and existing active lock.
- Two concurrent creates for the same bike: exactly one `201`, one conflict,
  exactly one rental, charge, lock, and rented bike.
- Close active rental and restore availability.
- Reject close of non-active rental and closure before start.
- Preserve closure notes and existing future charges.
- Update rental without changing bike.
- Update rental while changing bikes, including contention with another
  rental.
- Reject update of a closed rental or unavailable replacement bike.
- Generate next charge and retry it without duplicate sequence.
- Generate up to a date with bounded multiple transactions.
- Stop generation at actual closure and reject cancelled rentals.
- Read rental charges in sequence order and due charges by date/status.
- Verify all protected routes reject missing, malformed, expired, invalid, and
  revoked tokens.
- Verify API responses never contain password hashes or internal lock data.

### Differential contract tests

For each of routes 21-30, run identical seeded fixtures against Java and the
Firebase emulator. Compare status, response property names, null behavior,
enum strings, decimal serialization, date/timestamp format, page envelope,
ordering, and business error message where the Stage A matrix requires it.
Record intentional differences separately; do not silently normalize them.

## Acceptance checklist

### Scope and safety

- [ ] Only `backend-firebase/` and migration documentation changed.
- [ ] Java, Flutter, React, Neon PostgreSQL, and production Firebase are
      untouched.
- [ ] No production secret or production data is used.
- [ ] No payments, inventory, servicing, reports, migration, or deployment
      code is included.

### Implementation

- [ ] Routes 21-30 exist with exact methods and paths.
- [ ] All C3 routes require authenticated owner access.
- [ ] UUIDs are preserved as document IDs and references.
- [ ] `rentals`, `rental_charges`, and `active_rental_locks` use the specified
      schema and deterministic IDs.
- [ ] Bike/customer prerequisite repositories are complete enough for C3.
- [ ] Initial charge creation is atomic with rental creation.
- [ ] One active rental per bike holds under contention.
- [ ] Closure and bike availability updates are atomic.
- [ ] Bike reassignment preserves both old and new lock/status invariants.
- [ ] Charge sequence creation is duplicate-safe.
- [ ] Generate-up-to-date is bounded and repeatable.
- [ ] No floating-point money arithmetic is used.
- [ ] Pagination matches the Java envelope and defaults.
- [ ] Required indexes are generated from tested queries.

### Verification

- [ ] TypeScript typecheck passes.
- [ ] Production build passes without production configuration.
- [ ] Unit tests pass.
- [ ] Emulator tests pass with no skips in the emulator job.
- [ ] Concurrency tests prove exactly-one allocation.
- [ ] Contract fixtures cover all 10 C3 routes.
- [ ] `npm audit --omit=dev` passes without applying forced fixes.
- [ ] `git diff --check` passes.
- [ ] C3 exit report records known Java/Firebase differences and unresolved
      production JWT/BCrypt compatibility.

## Implementation order after approval

1. Add shared date, decimal, page, and error-contract utilities.
2. Implement or verify minimum bike/customer repositories and emulator seeds.
3. Implement rental and active-lock repository primitives.
4. Implement rental creation and closure transactions.
5. Implement rental update with bike reassignment.
6. Implement rental list/detail and pagination.
7. Implement deterministic charge generation and bounded up-to-date flow.
8. Implement charge reads and paid/remaining read enrichment.
9. Add unit, emulator contention, retry, and contract tests.
10. Run the C3 acceptance checklist and obtain review approval before C4.

## Stage C3 implementation result

Implemented inside `backend-firebase/`:

- Shared strict date-only, decimal money, pagination, domain, and error
  utilities.
- Firestore repositories and transactional services for customers, bikes,
  rentals, active-rental locks, rental charges, charge cursors, and read-only
  payment allocations.
- Routes 21-30 with owner authentication, Java-compatible success statuses,
  DTO field shapes, pagination envelopes, validation, and error mapping.
- Atomic rental creation, closure, and bike reassignment. Concurrent
  allocation attempts are protected by the `active_rental_locks` transaction
  invariant.
- Deterministic initial and recurring charge IDs, bounded up-to-date
  generation, and paid/remaining read enrichment without payment writes.

Verification completed:

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: passed; emulator-dependent tests are intentionally skipped when
  no emulator is reachable.
- `npm run test:emulator`: passed, 8 tests, 0 failures, with all emulator
  scenarios executed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed for the repository changes; Git emitted only
  pre-existing line-ending warnings for unrelated files.

Known limitations and follow-up gates:

- Pagination uses Firestore queries, count aggregation, bounded page reads,
  cursor traversal with `startAfter`, and document-ID tie-breakers. High page
  numbers still read preceding pages and therefore cost more; a future cursor
  API would improve that access pattern.
- Payment allocation writes, bike/customer public CRUD endpoints, and all
  later payments, inventory, servicing, reports, and migration stages remain
  intentionally out of scope.
- Production JWT byte compatibility remains unverified because the production
  signing secret and BCrypt fixture are unavailable. No production resources
  or credentials were used.
- The emulator test runner is serialized because the authentication and rental
  integration suites intentionally reset shared emulator collections.

## Stage C3.1 remediation status

The acceptance-review remediation added:

- strict UUID validation for rental and charge path parameters and request IDs;
- planned-end-date ordering validation during rental creation;
- Java-compatible `400` handling for archived-bike business validation;
- old-bike status and lock-owner validation before reassignment writes;
- emulator coverage for missing and foreign locks, failed reassignment
  preservation, archived/unavailable fixtures, malformed IDs, unsupported
  sorting, and concurrent reassignment to one target bike;
- sequential child-process test execution so authentication and rental suites
  cannot reset the same emulator collections concurrently;
- Firestore count aggregation plus query-based, cursor traversal pagination
  with document-ID tie-breakers;
- numeric Firestore ordering for `chargeSequence` and Java-compatible
  `dueDate,ASC` charge defaults;
- bounded paid-allocation reads for returned charge pages (chunked within the
  Firestore `in` query limit) and bounded charge/due-charge/generation results
  with explicit conflict errors at the limit;
- additional emulator indexes for rental, charge, due-charge, and allocation
  query shapes;
- unit coverage for money rounding/negative rejection/safe serialization,
  allocation validation, leap-year dates, and pagination validation.

Pagination uses a Firestore count aggregation for `totalElements`, then reads
only the requested page by traversing `limit(size)` queries with
`startAfter(lastDocument)` for preceding page numbers. This preserves the
Java page envelope but page N still reads up to N pages; callers should prefer
small page numbers or a future cursor API. Count aggregation and returned
documents are bounded by Firestore billing semantics, unlike the former full
collection reads. Charge paid totals are queried only for IDs in the returned
page (up to the documented bounded result size).

The indexes file documents the tested equality/filter and sort combinations.
New filter/sort combinations must be added and emulator-tested before
production use; Firestore may require additional composite indexes for
directions or combinations not listed there.

## Stage C3.2 contract and index completion

The Java-derived contract fixture is
[`tests/fixtures/c3-java-contract.json`](../../backend-firebase/tests/fixtures/c3-java-contract.json).
It records controller methods, paths, success statuses, DTO fields, and the
Java page envelope. The executable shape test is
`tests/c3.contract.test.ts`; the emulator workflow additionally exercises
routes 21-30, DTO keys, Java default sort directions, validation statuses,
and missing-token protection.

This is a controlled source-derived fixture, not a live Java-versus-Firebase
process comparison. The Java backend is not started or modified by the test
suite, so runtime differential behavior and exact business-message parity
remain **NOT VERIFIED** until an isolated Java fixture service is available.

### Supported Firestore query/index matrix

| Endpoint | Equality filters | Sort fields | Direction | Read strategy |
|---|---|---|---|---|
| 25 rental list | `status`, `customerId`, `bikeId` | `startDate`, `createdAt`, `status` | ASC/DESC | count aggregation + bounded page traversal |
| 28 rental charges | `rentalId` | `chargeSequence` | ASC | bounded rental query |
| 29 due charges | status in `UNPAID/PARTIALLY_PAID` | `dueDate` | ASC | `limit(1001)` bounded query |
| 30 charge list | `status`, `currency`, `customerId`, `rentalId` | `dueDate`, `createdAt`, `chargeSequence`, `status` | ASC/DESC | count aggregation + bounded page traversal |

The implementation adds composite indexes for the tested equality and sort
shapes in `backend-firebase/firestore.indexes.json`. Single-field equality
cases use Firestore automatic indexes; combinations not represented in the
matrix require additional local validation before use. Payment allocation
reads are restricted to returned charge IDs and chunked to the Firestore
`in` query limit. No lock or cursor collection is included in public DTOs.

### C3.2 verification status

- Contract fixture shape test: passed.
- All ten route paths are exercised by the emulator workflow; exact live Java
  differential execution: **NOT VERIFIED**.
- Missing-token protection is exercised across rental and charge routes.
- Internal lock/cursor exposure is prevented by DTO mapping and deny-all rules.
- Production JWT and BCrypt compatibility remain **NOT VERIFIED**.

Final validation completed:

- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm test`: PASS (emulator-dependent tests are skipped when no emulator is running)
- `npm run test:emulator`: PASS in three consecutive clean emulator runs
- `npm audit --omit=dev`: PASS, zero vulnerabilities
- `git diff --check`: PASS (only pre-existing line-ending warnings outside this scope)

The C3.2 review does not itself accept Stage C3. Live Java differential
execution, production JWT/BCrypt compatibility, and exhaustive production
index behavior remain gated items for independent acceptance.

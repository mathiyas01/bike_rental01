# Stage B: Firebase backend architecture

## Status and scope

This is the design for Stage C. It does not create Firebase source code, modify
the Java backend, change either client, migrate data, or deploy infrastructure.
The design is based on the 61 routes and contracts in the Stage A audit and the
implemented Spring services/controllers.

## Target topology

```text
Flutter / React
        |
        | HTTPS, existing /api/v1/* contract
        v
Firebase HTTPS callable entry point (2nd-gen HTTPS function, region pin)
        |
        v
Express app
  request id + CORS + JSON limits
  authentication middleware
  owner authorization middleware
  validation/normalization middleware
  route controllers
  domain services
  Firestore repositories / transaction helpers
        |
        +--> Cloud Firestore
        +--> Secret Manager (JWT key, migration/admin secrets)
        +--> Cloud Logging / Error Reporting
```

The function should export one Express application, for example `api`, and
mount the existing routes below `/api/v1`. The deployment URL may change, but
the path after the function host must remain unchanged. The function region
must be selected once and used consistently by all environments; the first
candidate is the region nearest the production users, subject to latency and
Firestore-region compatibility.

## TypeScript package boundaries

```text
functions/src/
  index.ts
  app.ts
  config/                 runtime config, secrets, allowed origins
  middleware/             auth, owner role, validation, errors, request id
  routes/                 route registration only
  controllers/            HTTP parsing and response status only
  services/               business invariants and transactions
  repositories/           Firestore reads/writes and query builders
  transactions/           bounded transaction workflows
  models/                 persisted document types
  dto/                    request/response contract types
  validators/             schema validation with exact field messages
  money/                  decimal arithmetic and serialization
  reporting/               summary reads and reconciliation
  migration/               offline PostgreSQL import tooling
  tests/                  emulator, contract, and differential tests
```

Controllers must not contain business rules. Repositories must not decide
HTTP status codes. Services return domain results or typed domain errors.

## Request pipeline

1. Apply a strict JSON body limit and request ID.
2. Apply explicit production CORS origins. Do not copy the existing
   `*`-origin-plus-credentials setting to production.
3. Parse the `Authorization: Bearer <token>` header.
4. Verify the compatibility JWT and load the owner document. Reject invalid,
   expired, inactive, or unknown users with the existing unauthorized shape.
5. Require `ROLE_OWNER` for every protected route. This is currently the only
   role in the database.
6. Validate request bodies and query parameters using schemas derived from the
   Java DTO annotations. Preserve field names and validation messages.
7. Invoke the controller and service.
8. Serialize response DTOs without renaming fields or converting ISO dates to
   Firestore timestamp JSON.
9. Convert typed errors through one error middleware into `ErrorResponse`.

Login and bootstrap are the only anonymous routes. The development
`reset-password` route must be disabled in production by configuration and
must never become anonymous merely because it is a development helper.

## Firestore access model

All application data is accessed through Admin SDK from the server function.
Clients do not receive direct Firestore access. Firestore Security Rules should
deny direct client reads/writes by default; the Admin SDK bypass is therefore
not a substitute for API authorization.

Repositories expose:

- `getById`, `createWithId`, `update`, and `exists` primitives.
- Explicit query methods for every endpoint filter/sort combination.
- A `runTransaction` wrapper with bounded retry handling.
- Batched writes only for independent immutable records.
- `BulkWriter` only for offline migration, never for a business operation that
  needs read-after-write consistency.

Document IDs remain the original UUID strings. Supporting lock/uniqueness
documents use deterministic IDs derived from those UUIDs.

## Pagination, sorting, and indexes

The API must continue returning `PageResponse` with `pageNumber`, `pageSize`,
`totalElements`, `totalPages`, and `last`. Firestore cursor pagination is the
safe operational primitive, but the legacy envelope requires a count.

Stage C should implement a bounded compatibility paginator:

- Parse Spring-style `page`, `size`, and `sort` values.
- Cap `size` at a documented maximum while preserving the existing default 20.
- Query in stable sort order with `__name__` as a deterministic tie breaker.
- Use a count aggregation for `totalElements` where available; otherwise use a
  maintained collection counter and reconcile it.
- Read only the requested page. Do not fetch an entire collection to paginate.
- Return `last` from the count/page result.

Every supported filter/sort pair must have a composite index in
`firestore.indexes.json`. Search by name/code is not a native full-text query;
Stage C should use normalized prefix fields for the existing search behavior or
an explicitly bounded scan only for small collections. No unbounded scan is
acceptable for production.

## Error compatibility

The error middleware emits:

```json
{
  "timestamp": "2026-01-01T00:00:00Z",
  "status": 400,
  "error": "VALIDATION_FAILED",
  "message": "Input validation failed",
  "path": "/api/v1/...",
  "validationErrors": [
    {"field": "amount", "rejectedValue": "0", "message": "Payment amount must be greater than 0"}
  ]
}
```

Typed errors must preserve the Java status, error code, message, path, and
validation fields. Unexpected errors are logged with the request ID and return
the existing generic 500 response without stack traces or sensitive data.

## Concurrent operations

Rental allocation, rental closure, charge generation, payment allocation,
payment reversal, stock movement, and service logging use Firestore
transactions. A transaction reads every document whose current value
determines a write, then writes only the bounded set of documents required by
the operation. The service retries only Firestore contention errors and
returns a conflict after a bounded retry budget.

Long-running report aggregation and migration are not request transactions.
Reports use maintained summaries plus bounded reconciliation jobs. Migration
uses checkpointed batches and is never part of a user request.

## Authoritative financial and quantity representation

The Java source uses `BigDecimal`, so TypeScript `number` is not acceptable for
money. Use canonical decimal strings as the authoritative persisted representation and
a pinned arbitrary-precision decimal library for every calculation. This
matches Java `BigDecimal` semantics without JavaScript floating point. Money
uses scale 2, rounds with `HALF_UP` only at documented monetary boundaries,
and rejects values with more than two fractional digits unless the Java
fixture proves the source permits them. RON, EUR, and USD are separate
buckets; no exchange-rate conversion or cross-currency sum is introduced.

Fractional inventory quantities are separate from money: preserve the source
`NUMERIC(10,2)` scale, use decimal strings with scale 2, and reject more than
two fractional digits. Odometer values preserve the source one-decimal scale.
Migration, counters, reconciliation, and reports all use the same decimal
library and explicit scale rules. JSON serialization follows the Java
Jackson-compatible contract established by golden tests; internal storage never
depends on JSON numeric floating-point parsing.

## Reports and analytics

Query-time aggregation most closely matches PostgreSQL but becomes expensive
and vulnerable to Firestore read limits. Purely scheduled summaries are cheap
to read but can be stale and are difficult to reconcile after retries.
Transactionally maintained counters are correct for write-driven totals but do
not by themselves answer every date-range or historical query.

Use a hybrid: maintain per-currency counters and fleet/low-stock counters in
the same bounded business transactions; maintain date-bucket summary
documents for dashboard and common date-range reads; use bounded source
queries for less frequent detail/ROI requests; and run scheduled
reconciliation against immutable ledgers. Every summary carries a version and
last-reconciled timestamp. Never use a summary to authorize payment,
availability, or stock decisions.

## Deployment and environments

- Separate Firebase projects or equivalent isolated environments for emulator,
  development, staging, and production.
- Secret Manager for the JWT signing secret and any migration credentials.
- No service-account key in Flutter, React, source control, or client bundles.
- Emulator Suite for Functions, Firestore, and Auth only if the compatibility
  layer uses Auth; seed data must be synthetic.
- Explicit web origins in configuration; mobile requests do not require a web
  origin allowlist.
- Cloud Logging with structured request IDs, route, duration, status, and
  domain operation; never log passwords, tokens, or full payment payloads.
- Deployment is blocked until contract, concurrency, migration, and client
  integration tests pass in staging.

## Architectural limitations

Firestore has no relational joins, partial unique indexes, arbitrary
transactions across unlimited documents, or native case-insensitive search.
The design addresses these with deterministic uniqueness documents, bounded
transactions, denormalized display fields, explicit indexes, and normalized
search fields. Exact parity must be verified with the Java API before cutover.

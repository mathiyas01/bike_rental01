# Stage B: Firebase cost and deployment analysis

## Cost model

Actual cost depends on traffic, document sizes, regions, retention, and
function duration; no cheaper/free outcome is assumed. The main cost drivers
are:

- Cloud Functions invocations, CPU/memory duration, concurrency, and outbound
  network traffic.
- Firestore document reads for list pages, joins, payment allocation, and
  reports.
- Firestore document writes for immutable ledger entries, allocations,
  denormalized snapshots, counters, and retries.
- Firestore storage and index storage, especially duplicated display fields and
  historical ledgers.
- Logging volume, Error Reporting, scheduled reconciliation, and migration
  exports.
- Storage/egress only if future file/image requirements are discovered; the
  current audit found no file-storage endpoint.

## Highest-risk read/write patterns

1. Dashboard/report queries that scan all bikes, charges, payments, services,
   or movements on every request.
2. Large FIFO payment allocations reading many charges and writing every
   affected charge/counter.
3. Service operations that write a service, each part usage, each movement,
   parts, bike, and summary counters.
4. Broad search endpoints if implemented as unbounded Firestore scans.
5. Excessive composite indexes on every filter/sort permutation.
6. Transaction retries under hot-bike or hot-part contention.
7. Migration BulkWriter retries and duplicate index storage.

## Cost controls

- Keep REST requests rather than real-time listeners; the current clients do
  not require live subscriptions.
- Enforce page-size caps and cursor-based reads behind the legacy envelope.
- Use normalized prefix fields and indexes for supported search; do not scan
  entire collections.
- Maintain bounded summary counters and per-currency totals transactionally
  for dashboards, while periodically reconciling them.
- Cache short-lived read-only report responses only when staleness is
  explicitly acceptable; never cache payment, balance, stock, or availability
  decisions.
- Denormalize only fields required by DTOs and common report queries.
- Avoid writing unchanged fields and avoid duplicating unbounded child arrays.
- Retain immutable ledgers but define retention/export policy before production.
- Use structured sampling for successful request logs; retain all errors and
  audit events.
- Schedule reconciliation at a low frequency and alert on drift rather than
  recomputing every request.

## Deployment architecture

- Use separate emulator, development, staging, and production Firebase
  projects.
- Pin the Functions 2nd-gen runtime to a supported Node.js LTS version during
  Stage C dependency setup.
- Choose a region near users and compatible with Firestore location; changing
  regions later adds latency and migration complexity.
- Store JWT keys, database/migration credentials, and any third-party secrets
  in Secret Manager.
- Use Firestore rules that deny direct client access by default.
- Configure explicit production CORS origins and a strict request body limit.
- Enable Cloud Logging, Error Reporting, alerting, and budget notifications.
- Deploy indexes/rules/functions from versioned configuration only after
  emulator and staging checks.

## Emulator setup

The Emulator Suite should run Functions and Firestore for contract, validation,
transaction contention, and report tests. Use synthetic seed data with
distinct UUIDs. If Firebase Auth is later evaluated, add its emulator only
for that experiment; the recommended first design uses server-side custom JWT
compatibility.

## Usage measurement before approval

Stage C must instrument:

- requests by route/status and average/max duration;
- Firestore reads/writes per operation;
- transaction retry counts and contention;
- report query document counts;
- average page size and response payload;
- function memory/CPU and cold-start behavior;
- log volume and migration throughput.

Estimate monthly cost from measured production-like load, not from the
Firebase free tier. Set budget alerts and a rollback threshold before
production traffic is switched.


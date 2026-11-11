# Stage B: implementation roadmap

## Stage gates

Stage B is design only. Stage C must not begin production deployment or
frontend switching. Every gate produces evidence and an explicit review point.

### C1 — Scaffold and compatibility foundation

- Create `backend-firebase/` separately from `backend/`.
- Set up Functions 2nd gen, TypeScript, Express, Admin SDK, emulator config,
  lint/type-check/test commands, and environment validation.
- Implement shared DTO schemas, date/decimal utilities, error middleware,
  request IDs, CORS, and compatibility JWT middleware.
- Add route registration for all 61 paths before business implementation.

Exit evidence: emulator starts, TypeScript checks, all routes respond with
controlled placeholder/not-implemented errors only in development, and no
existing project code changed.

### C2 — Authentication and reference repositories

- Implement BCrypt verification and legacy JWT signing/verification.
- Implement bootstrap guard, owner authorization, profile/language/currency,
  production-disabled reset behavior.
- Implement users, uniqueness locks, customers, bikes, suppliers, and parts
  repositories with validators and archive rules.

Exit evidence: Java/Firebase token compatibility tests and auth contract tests.

### C3 — Rental and charge workflows

- Implement active-rental locks, rental creation/closure/update/list/detail.
- Implement deterministic charge sequence creation and bounded generation.
- Add emulator contention and duplicate-request tests.

Exit evidence: one-active-rental invariant holds under concurrent requests;
all 15 rental/charge routes match status and response fixtures.

### C4 — Financial and inventory workflows

- Implement decimal arithmetic, payments, FIFO/manual allocation, reversal,
  balances, parts, and stock ledger.
- Add bounded transaction limits, idempotency records, and audit checks.

Exit evidence: multi-currency and reversal reconciliation, concurrent stock
deduction tests, and exact payment/charge response comparisons.

### C5 — Servicing and reports

- Implement service transactions with part usage, movements, odometer, and
  scheduling.
- Implement report read models/counters and reconciliation calculations for
  dashboard, utilization, date range, and ROI.
- Verify the existing Java ROI query behavior before freezing golden results.

Exit evidence: service rollback/insufficient-stock tests and report fixtures
agree with the approved Java behavior.

### C6 — PostgreSQL migration rehearsal

- Build offline read-only exporter/importer with checkpoints and quarantine.
- Rehearse on a copy, preserve UUIDs, rebuild locks/summaries, and reconcile
  all 15 tables and financial totals.

Exit evidence: signed row/reference/financial reconciliation report and a
tested rollback procedure.

### C7 — Differential and client integration testing

- Run every endpoint against Java and Firebase with identical fixtures.
- Test invalid inputs, auth failures, concurrency, retries, pagination, and
  date/currency edge cases.
- Run Flutter and React smoke tests against the emulator/staging base URL
  without changing application functionality.

Exit evidence: 61/61 endpoint contract results, workflow results, client
results, known differences approved, and no critical unresolved risk.

### C8 — Staging and approval

- Deploy only to a non-production Firebase project.
- Measure reads/writes, latency, retries, errors, and cost drivers.
- Perform final snapshot/import rehearsal and security review.
- Obtain explicit user approval before any production deployment or API URL
  switch.

## Deliverables by stage

- Source and tests in `backend-firebase/`.
- Emulator seed/fixtures and contract test report.
- Firestore rules and index configuration.
- Migration tool and reconciliation report.
- Deployment/runbook documentation.
- Final parity report with endpoint, feature, data, auth, mobile, web, and
  cost evidence.

## Risk register and mitigations

| Risk | Mitigation |
|---|---|
| Legacy JWT/BCrypt incompatibility | Cross-language known-answer tests before data cutover |
| Firestore uniqueness race | Deterministic lock documents in transactions |
| Transaction size/large FIFO allocation | Explicit limits and bounded workflow design |
| Counter/report drift | Versioned summaries plus scheduled reconciliation |
| Missing source changes during migration | Freeze window or approved change capture |
| Pagination semantic difference | Golden page fixtures and stable cursor tie-breakers |
| Search behavior difference | Normalize/index supported fields; test exact fixtures |
| Accidental reset exposure | Environment-gated route registration and auth requirement |
| Unexpected Java behavior | Differential tests and documented approval of deviations |

## Estimated complexity

This is a high-complexity migration, not a simple hosting change. The largest
work items are financial/inventory transaction parity, legacy authentication,
Firestore query/index design, migration reconciliation, and 61-route
differential testing. A realistic estimate requires measuring source data
volume and test coverage in Stage C; no duration or cost guarantee should be
made from the current audit alone.

## Recommended implementation order

1. Compatibility foundation and auth.
2. Reference data and uniqueness.
3. Rentals and charges.
4. Payments and inventory.
5. Servicing.
6. Summary/report read models.
7. Migration rehearsal.
8. Differential/client testing.
9. Staging measurement.
10. Explicit production approval and only then cutover.

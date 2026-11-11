# Stage B review and corrections

## Scope

This review refines the Stage B architecture only. It does not create Firebase
source code, modify the Java backend or either frontend, migrate PostgreSQL
records, or deploy infrastructure.

## Corrections made

1. **Authentication precision**
   - Documented JJWT `signWith(SecretKey)` behavior, Base64/raw secret
     handling, default 256-bit HS256 behavior, claims, subject, `iat`, `exp`,
     expiration response, and verification.
   - Documented BCrypt cost 12 and compatible hash/password requirements.
   - Added legacy-token handling when `authVersion` is absent.
   - Added `authVersion` and token-issued-before behavior for new tokens and
     revocation.
   - Corrected bootstrap to reject any existing user, including inactive users,
     matching Java `count() > 0`.
   - Defined transactional/concurrent bootstrap protection.
   - Defined production reset-password behavior: route not registered; only
     authenticated owner use in explicitly enabled development.

2. **Hashed Firestore uniqueness locks**
   - Replaced raw normalized values in lock paths with
     `sha256(normalizedValue)`.
   - Defined lock fields, collision detection, ownership verification,
     update reservation/release order, and archive behavior.

3. **Service inventory parity**
   - Verified `ServicingService.logService` deducts parts and writes
     `SERVICE_USAGE` movements for every accepted status, including planned,
     in-progress, completed, and cancelled.
   - Explicitly prohibited introducing a completed-only deduction rule.

4. **Transaction limits**
   - Added explicit maximum item counts and document budgets for FIFO/manual
     payments, reversals, service usage, and inventory movements.
   - Required pre-write rejection and all-or-nothing behavior.

5. **Financial precision**
   - Selected canonical decimal strings plus pinned arbitrary-precision decimal
     arithmetic as authoritative.
   - Defined scale 2/HALF_UP money rules, scale 2 fractional inventory rules,
     odometer scale, JSON compatibility testing, migration conversion, and
     reconciliation behavior.

6. **API compatibility**
   - Confirmed Stage A's matrix remains authoritative.
   - Required one named contract test for each of the 61 endpoints.
   - Confirmed the Java bike-ROI lookup defect and required Firebase to preserve
     it for strict parity unless separately approved for correction.

7. **Migration rehearsal**
   - Added a mandatory rehearsal against a separate copy/snapshot of
     PostgreSQL.
   - Added acceptance checks for all 15 collections, UUIDs, relationships,
     financial balances, allocations, stock, histories, reports, and
     idempotent repeat imports.

## Unresolved technical decisions

- The exact production JWT secret length and therefore selected JJWT HMAC
  algorithm must be confirmed from deployment configuration without exposing
  the secret.
- The exact Jackson JSON representation of `BigDecimal` values must be captured
  in golden tests before fixing Firebase serialization.
- Firestore transaction document budgets may need adjustment after emulator
  measurement, but they must remain explicit and below platform limits.
- The current Java bike-ROI defect should not be corrected during migration
  without approval because doing so changes observed behavior.

## Assumptions requiring approval

- The first migration uses the custom JWT compatibility approach, not Firebase
  Authentication token replacement.
- Production uses a maintenance/freeze window unless an approved change-capture
  mechanism is added.
- The stated transaction caps (50 allocation/usage items and bounded document
  budgets) are acceptable operational limits.
- Production reset-password remains disabled.
- Firebase direct client access remains denied; all data access uses the REST
  API.

## Confirmation

Only documentation under `docs/firebase-migration/` was changed by this
review. No application source code, Java backend, Flutter app, React app,
PostgreSQL database, Firebase project, or deployed service was changed.

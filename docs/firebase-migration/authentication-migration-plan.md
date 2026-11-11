# Stage B: authentication migration plan

## Current contract

The Java `JwtTokenProvider` uses JJWT `signWith(SecretKey)`. The secret is
first Base64-decoded; if decoding fails, the raw UTF-8 secret bytes are used.
JJWT selects the HMAC JWT algorithm supported by the resulting key length
(therefore the deployed secret length determines HS256/HS384/HS512; the
current default is a 256-bit Base64 key and produces HS256). Stage C must
record the actual production secret length/algorithm as a deployment invariant,
not assume a different algorithm.

Each newly issued token has:

- `sub`: `UserPrincipal.getUsername()`, which is the normalized email.
- `userId`: the UUID string.
- `role`: the user's role, normally `ROLE_OWNER`.
- `lang`: the preferred language.
- standard `iat`: the `Date now` captured at issuance.
- standard `exp`: `iat + expirationMs`; default `expirationMs` is 86,400,000.

There is no issuer, audience, `jti`, or `authVersion` claim in the current
implementation. Verification uses the same HMAC key and JJWT
`parseSignedClaims`; signature, expiration, malformed claims, and invalid UUID
values fail validation. The filter then loads the user and applies current
user/role checks. `expiresIn` in the login response is `expirationMs / 1000`.

BCrypt compatibility requires `$2a$`, `$2b$`, or `$2y$` compatible verification
of the existing 60-character hashes, cost factor 12 as currently configured,
UTF-8 password bytes, and no password normalization or truncation in the
compatibility layer. New hashes must use the same cost 12 until a separately
approved rehash policy exists. Password comparison must be constant-time as
provided by the vetted BCrypt library.

## Option A: retain the custom JWT contract

The Firebase service would:

1. Read the existing `password_hash` and user fields from Firestore.
2. Verify passwords with a compatible BCrypt implementation.
3. Sign the same claim names and compatible HMAC algorithm with a Secret
   Manager key.
4. Return the existing login response and expiration value.
5. Verify signature, expiration, user ID, active state, and owner role on each
   request.

Advantages:

- Existing mobile and React code continues unchanged.
- Existing BCrypt hashes remain usable without forced password resets.
- Existing tokens can remain valid during a controlled dual-run period if the
  signing secret and claim semantics are retained.
- Logout behavior remains the current client-side token removal behavior; no
  new client endpoint is needed.

Risks and controls:

- Key custody, rotation, revocation, and token replay remain application
  responsibilities. Store the key only in Secret Manager.
- A long one-day token limits immediate revocation. Check the user active state
  on every request and add an `authVersion`/revocation epoch for newly issued
  tokens.
- The BCrypt library and JWT library must be pinned, tested against known Java
  tokens, and kept server-side.

## Option B: Firebase Authentication compatibility layer

Firebase Authentication could store the owner account and issue Firebase ID
tokens, while the Express API exchanges or verifies them and returns the
legacy `LoginResponse`. This is not a direct replacement:

- Firebase Auth does not consume an arbitrary existing BCrypt hash as a
  password credential. A controlled migration requires either a custom-token
  bootstrap plus password reset, an Admin SDK import with a supported hash
  configuration, or a one-time credential migration flow.
- Firebase ID tokens have Firebase-specific claims, issuer, audience, and
  expiration semantics. Existing clients only know the legacy response and
  Bearer token, so the compatibility layer would need to issue a legacy token
  anyway or change clients.
- Firebase Auth logout is primarily token/client state; already issued ID
  tokens remain valid until expiry unless revocation checks are added.
- The current development reset endpoint cannot safely be mapped to an
  unauthenticated Firebase password reset without changing behavior and risk.

Advantages include managed identity lifecycle, refresh-token infrastructure,
optional MFA, and future provider integrations. Those benefits do not remove
the BCrypt and legacy JWT compatibility work.

## Recommendation

Use **Option A for the first migration**. It minimizes Flutter and React
changes, preserves the owner account and BCrypt hashes, and matches the
observed API exactly. Use a well-maintained TypeScript BCrypt implementation
and JWT implementation in the server function only. Keep the existing signing
secret during the overlap window, rotate it only through a planned token
rollover, and test Java-issued tokens against Firebase verification.

Evaluate Option B later as a separate authentication migration. It should not
be combined with the database/backend cutover because it adds a credential
migration and client-token risk unrelated to Firestore.

## Bootstrap and password reset

Bootstrap must check for **any existing `app_users` document**, including
inactive users and users with a role other than the expected owner role. This
matches Java's `userRepository.count() > 0`, not an "active owner only" check.
The check, deterministic singleton `bootstrap_lock` acquisition, user
creation, email uniqueness lock, password hash, and first token issuance are
one transaction. A concurrent caller that loses the lock or observes any user
returns the existing conflict response; it must not overwrite or create a
second owner.

Existing tokens without `authVersion` are accepted after normal signature,
expiration, subject/user lookup, active-user, and owner-role checks. They are
treated as legacy tokens for the compatibility window and are subject to
user-level invalidation (`authVersion`/`tokenIssuedBefore`) checked outside the
token claims. Newly issued tokens include `authVersion` equal to the user's
current integer epoch. Verification requires that claim to equal the current
epoch for new tokens; absence is allowed only for legacy tokens. Incrementing
the epoch revokes both legacy tokens through `tokenIssuedBefore` and new tokens
through the epoch check once the user document's revocation timestamp/epoch is
updated.

`reset-password` is **not registered in production** and production returns a
route-not-found response rather than exposing a password operation. In
development/emulator only, it is enabled behind an explicit environment flag,
requires an authenticated `ROLE_OWNER`, and may reset only the authenticated
owner's account; the request email must match that identity. It rehashes with
BCrypt cost 12, increments `authVersion`, updates revocation metadata, returns
204, and never logs or returns credentials.

## Logout, revocation, and rotation

There is no observed logout endpoint. Preserve current behavior: clients delete
their stored token. Server-side emergency invalidation uses `authVersion` or
`tokenIssuedBefore` on the user document, checked after signature validation.
Revocation changes are not exposed as a new public contract.

JWT rotation requires a short overlap with current and previous verification
keys, a `kid` only if it can be added without affecting existing clients, and
staged secret rollout. Never put signing keys in Firestore or client
configuration.

## Verification gates

- Verify Java BCrypt hashes with the selected Node implementation at cost 12.
- Verify Java-generated HS256 tokens using the deployed 256-bit default secret,
  and test HS384/HS512 rejection/acceptance rules when a different secret
  length is configured.
- Verify newly issued `authVersion` tokens and legacy tokens without that claim.
- Test expired, malformed, wrong-signature, inactive-user, non-owner, and
  revoked-token cases.
- Confirm login JSON, `expiresIn`, role, language, and profile fields exactly.
- Confirm protected endpoint responses remain the existing 401/403 shapes.
- Confirm bootstrap is one-time under concurrent requests.

## Stage C2 implementation status

The isolated `backend-firebase` project implements the first compatibility
slice without changing the Java backend or either client. Implemented routes:

- `POST /api/v1/auth/login` (`200`)
- `POST /api/v1/auth/bootstrap-owner` (`201`, one-time transaction)
- `GET /api/v1/auth/profile` (`200`)
- `PATCH /api/v1/auth/profile/language` (`200`)
- `PATCH /api/v1/auth/profile/currency` (`200`)
- `POST /api/v1/auth/reset-password` (`204` only with the explicit
  development flag; it is not registered in production)

Users are stored in `app_users` with UUID document IDs, normalized email,
BCrypt hash, owner role, active state, preferences, `authVersion`, and
timestamps. Bootstrap creates a SHA-256 email lock and singleton bootstrap
lock in the same Firestore transaction. Lock documents retain the lock type,
normalized value, owner record ID, and creation timestamp.

The Node implementation uses the Java-compatible claim names, HMAC key
decoding fallback, secret-length-selected HS256/HS384/HS512 algorithm, BCrypt
verification, expiration, owner/status checks, and login response fields.
New tokens include `authVersion`; tokens without that claim remain accepted as
legacy tokens subject to user-level revocation checks.

Validation completed for this slice includes TypeScript type checking,
production build, ordinary tests, Firestore Emulator integration tests, and
`npm audit --omit=dev` (zero production dependency vulnerabilities at
validation time). Java known-answer fixtures using the production secret are
still required before claiming byte-for-byte token compatibility, and the
remaining non-authentication API endpoints are not implemented yet.

## Stage C2.1 security and compatibility review

The Java source was rechecked against the Node implementation. Verified
compatibility includes the login and bootstrap paths, request field names,
profile field names and types, `200` login, `201` bootstrap, `204` development
reset, BCrypt verification, normalized-email subject, `userId`, `role`, and
`lang` claims, standard `iat`/`exp` claims, one-day default expiration, and
the Java Base64-then-UTF-8 secret decoding fallback. The Node verifier
allow-lists only the algorithm selected from the configured key length and
rejects invalid signatures, expired tokens, missing required claims, inactive
users, non-owner users, and auth-version mismatches.

The exact production JWT bytes remain unverified because the production
secret and a Java-generated known-answer token are unavailable. The deployed
JJWT version/key length combination must be fixture-tested before a
byte-for-byte compatibility claim. Existing production BCrypt hashes also
require controlled fixture tests; the selected library is tested against
standard BCrypt formats without exposing production credentials.

The review fixed inclusive second-boundary revocation for legacy tokens,
corrected algorithm-sensitive expiration testing, added tests for malformed
claims, invalid signatures, algorithm confusion, expired tokens, inactive
existing bootstrap users, and production reset-flag rejection. Auth integration
tests run fully under `npm run test:emulator`; ordinary `npm test` skips
emulator tests when no emulator is available and must not be treated as the
complete security gate.

Intentional differences remain: Node returns the full structured error body
for authentication failures, while Java's security entry point emits a
minimal body for some unauthenticated requests; Node restricts reset-password
to the authenticated owner and disables the route in production; and Node
requires owner role at the authentication middleware boundary. These are
documented hardening choices and require contract approval before production
cutover.

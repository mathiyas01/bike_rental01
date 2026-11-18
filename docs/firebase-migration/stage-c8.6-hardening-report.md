# Stage C8.6 – Firebase Backend Hardening

## Pre-Implementation Verification
- **`PaymentMethod.CARD` discrepancy resolved:** Java (`backend/src/main/java/ro/bikerental/modules/payment/entity/PaymentMethod.java`) defines `CASH` and `BANK_TRANSFER`. `backend-firebase` intentionally supports `CARD` (added in Stage C8.4.1 for Flutter/React UI parity) and was preserved unchanged.
- **Hosting platform check:** No `Dockerfile`, Cloud Run manifest, or platform-specific hosting config exists in the repository root, `backend/`, or `backend-firebase/`. Per Stage C8.6 rules, no platform-specific manifest or unnecessary infrastructure was added.

## Implemented Hardening Changes
1. **Graceful `SIGTERM`/`SIGINT` shutdown & HTTP server timeouts** (`backend-firebase/src/config/http-server.ts`, `backend-firebase/src/server.ts`):
   - Configured `keepAliveTimeout = 65_000`, `headersTimeout = 66_000`, and `requestTimeout = 30_000`.
   - Registered `SIGTERM`/`SIGINT` handlers to drain active connections via `server.close()` with a 10s forced-exit fallback.
2. **Malformed JSON handling (`400 BAD_REQUEST`)** (`backend-firebase/src/middleware/error.middleware.ts`):
   - Mapped `express.json()` `SyntaxError` (`status === 400`) to `400 BAD_REQUEST` (`ErrorResponse` format) instead of falling through to `500 INTERNAL_SERVER_ERROR`.
3. **Authentication rate limiting & proxy configuration** (`backend-firebase/src/routes/auth.routes.ts`, `backend-firebase/src/config/env.ts`, `backend-firebase/src/app.ts`):
   - Added `express-rate-limit` to `POST /api/v1/auth/login` (`AUTH_RATE_LIMIT_MAX`, default `20` per `AUTH_RATE_LIMIT_WINDOW_MS`, default `900000` ms) and `POST /api/v1/auth/bootstrap-owner` (`BOOTSTRAP_RATE_LIMIT_MAX`, default `10`), returning `429 TOO_MANY_REQUESTS`.
   - Added `TRUST_PROXY` (default `1` in `production`, `false` in `development`/`test`) on `app.set('trust proxy', config.trustProxy)`.
4. **Firestore readiness endpoint** (`backend-firebase/src/controllers/health.controller.ts`, `backend-firebase/src/routes/health.routes.ts`):
   - Preserved `GET /health` liveness (`200 { status: 'ok', service }`).
   - Added `GET /health/ready` performing a bounded `limit(1)` Firestore read (`200 { status: 'ready', firestore: 'ok' }` or `503 { status: 'unavailable', firestore: 'error' }`).
5. **Response logging on `finish`** (`backend-firebase/src/app.ts`):
   - Switched request logging from `request.on('end')` to `response.on('finish')` so the final HTTP status code is always recorded.

## Remaining Deployment Requirements
- Select a target hosting platform and provide its container/runtime entrypoint (`node dist/src/server.js`), setting `NODE_ENV=production`, `CORS_ORIGINS`, `FIREBASE_PROJECT_ID`, `JWT_SECRET`, and `TRUST_PROXY` (if behind >1 proxy hop).
- Deploy `backend-firebase/firestore.rules` and `backend-firebase/firestore.indexes.json` to the target Firebase project and execute live staging smoke tests before frontend cutover.

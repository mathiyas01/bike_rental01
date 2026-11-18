# Stage C8.4.5.1 – Remaining API Compatibility Fixes

## 1. Europe/Bucharest Business-Date Handling
- Added `BUSINESS_TIME_ZONE = 'Europe/Bucharest'`, `todayInTimeZone(referenceDate?, timeZone?)`, and `todayBucharest(referenceDate?)` in `backend-firebase/src/shared/dates.ts` using `Intl.DateTimeFormat(...).formatToParts(...)` so calendar-date calculation is independent of the host machine's local timezone.
- Updated default business-date lookups to use `todayBucharest()` (matching Java `Europe/Bucharest` `LocalDate.now()`):
  - `RentalService.dueCharges()` (`asOfDate` omitted)
  - `ReportsService.getDashboardKpis()` (`asOfDate` omitted)
  - `parseDueServicesQuery()` (`asOfDate` omitted)
  - `parseCreateCustomerInput()` (default `gdprConsentDate`)
- Preserved UTC date-only parsing, formatting, and arithmetic (`parseDate`, `addDays`, `isBefore`) and left explicitly supplied dates unchanged.

## 2. HTTP Security Headers
- Added `helmet` middleware in `backend-firebase/src/app.ts` with `X-Powered-By` disabled, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin` (with `contentSecurityPolicy: false` so API and doc endpoints are not unnecessarily restricted).
- Added `Cache-Control: no-store` for all `/api/v1/*` routes, including error responses handled by `notFoundMiddleware` and `errorMiddleware`.

## 3. CORS Configuration & Local Development Setup
- Configured `cors(...)` in `backend-firebase/src/app.ts` with:
  - `origin`: `config.corsOrigins.length > 0 ? config.corsOrigins : false` (production continues to reject an empty `CORS_ORIGINS` allow-list)
  - `methods`: `['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']`
  - `allowedHeaders`: `['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Origin']`
  - `exposedHeaders`: `['Authorization', 'Content-Disposition']`
  - `credentials`: `false`
  - `maxAge`: `3600`
- **Local development configuration:** Set `CORS_ORIGINS=http://localhost:5173,http://localhost:3000` (or the active Vite/Flutter Web origin) in `backend-firebase/.env` when testing browser clients locally; when `CORS_ORIGINS` is unset in dev/test, cross-origin browser requests are not granted `Access-Control-Allow-Origin`.

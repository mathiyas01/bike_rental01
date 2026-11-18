# MotoRental Pro Web

React, Vite and TypeScript web interface for the existing Motorbike Rental backend. The web client uses the same `/api/v1` endpoints and does not access PostgreSQL directly.

## Development

```powershell
cd web
npm install
Copy-Item .env.example .env
npm run dev
```

Set `VITE_API_URL` to the backend base URL (for local development, `http://localhost:8081` is used automatically when `VITE_API_URL` is unset). Production builds use `npm run build` and require `VITE_API_URL` at runtime/build time.

### Deploy to Cloudflare Pages

Create a Cloudflare Pages project for this repository with these settings:

- **Root directory:** `web`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variable (Production & Preview):** `VITE_API_URL=<deployed-firebase-functions-https-url>`

The real Firebase Cloud Functions Gen 2 HTTPS URL must be supplied in `VITE_API_URL` after backend deployment; production builds without `VITE_API_URL` fail rather than falling back to a legacy backend. The browser calls the Firebase Functions backend over HTTPS, and `public/_redirects` (`/* /index.html 200`) keeps React Router routes working when opened or refreshed directly.

The client sends the JWT returned by `POST /api/v1/auth/login` as a Bearer token. Rental charge generation, payment allocation/reversal, inventory ledger updates and service parts deduction remain backend transactions; the browser only submits the documented request DTOs.

## Feature inventory / mapping

| Mobile route | Web route | Backend surface |
|---|---|---|
| `/dashboard` | `/dashboard` | reports dashboard, fleet utilization |
| `/bikes` | `/bikes` | bikes CRUD/archive/status |
| `/customers` | `/customers` | customers CRUD/archive/balance |
| `/rentals` | `/rentals` | rentals, charges and close |
| `/payments` | `/payments` | payment record/reversal |
| `/servicing` | `/servicing` | service records and due reminders |
| `/inventory` | `/inventory` | parts and stock movements |
| `/reports` | `/reports` | utilization and bike ROI |
| `/settings`, `/more` | `/settings`, `/more` | profile language/currency and logout |

All monetary inputs retain the backend's RON/EUR/USD value and currency fields.

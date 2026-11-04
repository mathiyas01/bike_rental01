# MotoRental Pro Web

React, Vite and TypeScript web interface for the existing Motorbike Rental backend. The web client uses the same `/api/v1` endpoints and does not access PostgreSQL directly.

## Development

```powershell
cd web
npm install
Copy-Item .env.example .env
npm run dev
```

Set `VITE_API_URL` to the deployed Spring Boot base URL (for local development, `http://localhost:8081`). Production builds use `npm run build` and can be served with `npm run preview`.

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

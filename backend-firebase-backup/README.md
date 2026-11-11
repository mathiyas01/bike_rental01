# Firebase backend foundation

This is the isolated **Stage C1** foundation for the motorbike rental system.
It contains only Express infrastructure and `GET /health`; it does not yet
implement authentication or any business endpoint. The existing Java backend,
PostgreSQL database, Flutter app, and React app are not used or modified.

## Prerequisites

- Windows 11 and Visual Studio Code
- Node.js 20 LTS or newer (tested here with Node.js 24.12.0)
- npm 10 or newer
- Java is not required for this foundation
- Firebase CLI, installed globally or invoked with `npx`

Check versions in a VS Code PowerShell terminal:

```powershell
node --version
npm --version
npx firebase --version
```

## Install

```powershell
Set-Location "C:\Users\thisa\Desktop\Bike - Copy (2)\backend-firebase"
npm install
Copy-Item .env.example .env
```

The `.env` file is ignored by Git. For local work, the example values connect
the Admin SDK to a local Firestore emulator and use the non-production project
ID `bike-rental-local`. Do not add production credentials to this file.

## Start the backend in VS Code

```powershell
Set-Location "C:\Users\thisa\Desktop\Bike - Copy (2)\backend-firebase"
npm run dev
```

The development server listens on `http://localhost:8082`.

Test the health endpoint from another PowerShell terminal:

```powershell
Invoke-RestMethod -Uri "http://localhost:8082/health"
```

Expected response:

```json
{
  "status": "ok",
  "service": "bike-rental-firebase-backend"
}
```

## Start the Firestore emulator

The first emulator run may download emulator components. In one terminal:

```powershell
Set-Location "C:\Users\thisa\Desktop\Bike - Copy (2)\backend-firebase"
npx firebase emulators:start --only firestore
```

In another terminal, with `.env` containing
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, start the API:

```powershell
npm run dev
```

The Emulator UI is available at `http://127.0.0.1:4000` when enabled.

## Build, type-check, and test

```powershell
npm run typecheck
npm run build
npm test
```

The ordinary test command runs the application and health tests. The
Firestore-dependent test is skipped unless `FIRESTORE_EMULATOR_HOST` is set.
Run the full emulator-backed test command as follows:

```powershell
npm run test:emulator
```

`test:emulator` starts a temporary Firestore emulator, runs all compiled
tests, and stops it afterward.

## Common setup errors

- **`npm` or `node` is not recognized:** install Node.js LTS, restart VS Code,
  and reopen the PowerShell terminal.
- **Port 8082 is busy:** set another `PORT` in `.env`, then use that port when
  calling `/health`.
- **Firestore emulator connection refused:** start the emulator first, confirm
  `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, and check that port 8080 is free.
- **Firebase CLI is unavailable:** run `npx firebase --version`; do not create
  or select a production Firebase project for Stage C1.
- **Production configuration error:** Stage C1 intentionally has no production
  Firebase setup. Use the local project ID and emulator only.

## Stage C1 boundaries

The following are intentionally not present yet:

- Authentication or JWT compatibility
- `/api/v1` business routes
- PostgreSQL migration tooling
- Production Firebase project configuration
- Frontend URL changes


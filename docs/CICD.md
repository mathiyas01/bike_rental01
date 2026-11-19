# CI/CD setup

The `.github/workflows/ci-cd.yml` workflow validates pull requests and deploys
the tested web build to Cloudflare Pages after a successful push to `main`.

## GitHub repository configuration

Add these under **Settings > Secrets and variables > Actions**:

### Secrets

- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN`: a narrowly scoped token with **Account > Cloudflare
  Pages > Edit** permission for the deployment account.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service-account JSON used only by
  the deployment owner seed.
- `OWNER_EMAIL`: initial owner login email.
- `OWNER_PASSWORD`: initial owner password, with at least 12 characters.

### Variables

- `CLOUDFLARE_PAGES_PROJECT_NAME`: the existing Cloudflare Pages project name.
- `VITE_API_URL`: the production HTTPS API base URL, without a trailing slash.
- `OWNER_FULL_NAME`: display name for the initial owner.

The Pages project must use Direct Upload. Create it once in Cloudflare before
the first workflow run, or allow the deployment token to create it.

## Pipeline behavior

- Pull requests build the React frontend, type-check the Firebase backend and
  run its stable test suite.
- Pushes to `main` run the same checks.
- The initial owner is seeded directly into Firestore after validation. The
  seed is idempotent and does not reset an existing owner's password.
- Deployment starts only after validation and owner seeding pass.
- GitHub concurrency cancels obsolete runs for the same branch.
- The exact tested `web/dist` artifact is deployed; it is not rebuilt during
  the deployment job.

Firebase Functions are deliberately not deployed. The target cost-free
architecture uses Firebase Auth/Firestore as BaaS and will deploy privileged API
logic to Cloudflare Workers once that migration is complete.

## Emulator integration suite

Run `npm run test:emulator` from `backend-firebase` before a production data
migration. It is not currently a deployment gate because the existing payment
integration harness can intermittently select a blocked ephemeral port. Fix
that harness before promoting the emulator suite into the required CI jobs.

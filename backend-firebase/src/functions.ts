import type { Express } from 'express';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { initializeFirebase } from './config/firebase.js';

const jwtSecret = defineSecret('JWT_SECRET');

// Temporary default region for local development; final production region
// should match the confirmed Cloud Firestore database location before deploy.
const FUNCTIONS_REGION = process.env.FUNCTIONS_REGION?.trim() || 'europe-west1';

let cachedApp: Express | null = null;

function getExpressApp(): Express {
  if (cachedApp) return cachedApp;

  const secretValue = jwtSecret.value().trim();
  const config = loadConfig({
    PORT: '8082',
    ...(secretValue ? { JWT_SECRET: secretValue } : {}),
  });
  const { firestore } = initializeFirebase(config);

  cachedApp = createApp(config, firestore);
  return cachedApp;
}

export const api = onRequest(
  {
    region: FUNCTIONS_REGION,
    memory: '512MiB',
    secrets: [jwtSecret],
  },
  (request, response) => {
    const app = getExpressApp();
    app(request, response);
  },
);

import type { Express } from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { initializeFirebase } from './config/firebase.js';

// Temporary default region for local development; final production region
// should match the confirmed Cloud Firestore database location before deploy.
const FUNCTIONS_REGION = process.env.FUNCTIONS_REGION?.trim() || 'europe-west3';

let cachedApp: Express | null = null;

function getExpressApp(): Express {
  if (cachedApp) return cachedApp;

  const config = loadConfig({
    PORT: '8082',
    FIREBASE_PROJECT_ID: 'motorental-prod',
    CORS_ORIGINS: 'https://motorental-dashboard.pages.dev',
    // Required only by the legacy test-only JWT code path.
    JWT_SECRET: 'firebase-auth-production-unused-key',
  });
  const { firestore } = initializeFirebase(config);

  cachedApp = createApp(config, firestore);
  return cachedApp;
}

export const api = onRequest(
  {
    region: FUNCTIONS_REGION,
    memory: '512MiB',
  },
  (request, response) => {
    const app = getExpressApp();
    app(request, response);
  },
);

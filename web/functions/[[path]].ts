import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
import { createApp } from '../../backend-firebase/src/app.js';
import { parseEnvironment } from '../../backend-firebase/src/config/env.js';

interface Env {
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
}

let handler: ReturnType<typeof httpServerHandler> | undefined;

function createHandler(env: Env) {
  if (handler) return handler;

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  const firebase = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  const firestore = initializeFirestore(firebase, { preferRest: true });
  const config = parseEnvironment({
    NODE_ENV: 'production',
    FIREBASE_PROJECT_ID: serviceAccount.projectId,
    JWT_SECRET: 'firebase-auth-production-unused-key',
    CORS_ORIGINS: 'https://motorental-dashboard.pages.dev',
    ENABLE_DEV_PASSWORD_RESET: 'false',
  });
  const expressApp = createApp(config, firestore);
  const server = createServer(expressApp);
  handler = httpServerHandler(server);
  return handler;
}

export const onRequest: PagesFunction<Env> = (context) =>
  createHandler(context.env).fetch(context.request, context.env, context);

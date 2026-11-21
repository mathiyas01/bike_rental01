import '../cloudflare-runtime.js';
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

  const serviceAccountJson = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount & {
    project_id?: string;
  };
  const serviceAccount = serviceAccountJson as ServiceAccount;
  const projectId = serviceAccount.projectId ?? serviceAccountJson.project_id;
  const firebase = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  const firestore = initializeFirestore(firebase, { preferRest: true });
  const config = parseEnvironment({
    NODE_ENV: 'production',
    FIREBASE_PROJECT_ID: projectId,
    JWT_SECRET: 'firebase-auth-production-unused-key',
    CORS_ORIGINS: 'https://motorental-dashboard.pages.dev',
    ENABLE_DEV_PASSWORD_RESET: 'false',
  });
  const server = createServer(createApp(config, firestore));
  server.listen(8080);
  handler = httpServerHandler({ port: 8080 });
  return handler;
}

export const onRequest: PagesFunction<Env> = (context) =>
  createHandler(context.env).fetch(context.request, context.env, context);

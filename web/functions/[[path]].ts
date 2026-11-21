import { createServer } from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import type { ServiceAccount } from 'firebase-admin/app';

interface Env {
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
}

let handlerPromise: Promise<ReturnType<typeof httpServerHandler>> | undefined;

async function createHandler(env: Env) {
  if (handlerPromise) return handlerPromise;

  // google-gax reads this Node global while Firebase Admin loads. Cloudflare's
  // Node compatibility layer supplies the APIs but does not define the path.
  (globalThis as typeof globalThis & { __dirname?: string }).__dirname = '/';

  handlerPromise = (async () => {
    const [{ cert, getApps, initializeApp }, { initializeFirestore }, { createApp }, { parseEnvironment }] =
      await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/firestore'),
        import('../../backend-firebase/src/app.js'),
        import('../../backend-firebase/src/config/env.js'),
      ]);
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
    return httpServerHandler(createServer(expressApp));
  });
  return handlerPromise;
}

export const onRequest: PagesFunction<Env> = async (context) =>
  (await createHandler(context.env)).fetch(context.request, context.env, context);

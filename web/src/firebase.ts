import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

function required(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

// Firebase web identifiers are public client configuration. Environment values
// still take precedence for local development and alternate deployments.
const productionDefaults = {
  apiKey: 'AIzaSyCt9fDIClMdGq-W7JXw-Tdgz2gDlb9pLzc',
  authDomain: 'motorental-prod.firebaseapp.com',
  projectId: 'motorental-prod',
  appId: '1:368395393922:web:fa791373414588afde8d9b',
};

const app = initializeApp({
  apiKey: required('VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY ?? productionDefaults.apiKey),
  authDomain: required(
    'VITE_FIREBASE_AUTH_DOMAIN',
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? productionDefaults.authDomain,
  ),
  projectId: required(
    'VITE_FIREBASE_PROJECT_ID',
    import.meta.env.VITE_FIREBASE_PROJECT_ID ?? productionDefaults.projectId,
  ),
  appId: required('VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID ?? productionDefaults.appId),
});

export const firebaseAuth = getAuth(app);

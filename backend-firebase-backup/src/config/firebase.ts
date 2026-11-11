import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { AppConfig } from './env.js';

export function initializeFirebase(config: AppConfig) {
  if (config.environment === 'production' && config.firestoreEmulatorHost) {
    throw new Error('FIRESTORE_EMULATOR_HOST must not be set in production');
  }

  const app = getApps()[0] ?? initializeApp({
    projectId: config.firebaseProjectId,
  });

  return {
    app,
    firestore: getFirestore(app),
  };
}

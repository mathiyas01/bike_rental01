import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeFirebase } from '../src/config/firebase.js';
import { parseEnvironment } from '../src/config/env.js';

test('connects to the Firestore emulator when configured', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    context.skip('Set FIRESTORE_EMULATOR_HOST or run npm run test:emulator');
    return;
  }

  const config = parseEnvironment({
    NODE_ENV: 'test',
    FIREBASE_PROJECT_ID: 'bike-rental-test',
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  });
  const { firestore } = initializeFirebase(config);
  const reference = firestore.collection('stage_c1_checks').doc('connectivity');
  await reference.set({ status: 'ok' });
  assert.deepEqual((await reference.get()).data(), { status: 'ok' });
  await reference.delete();
});

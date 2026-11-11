import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { parseEnvironment } from '../src/config/env.js';

async function emulatorIsReachable(host: string): Promise<boolean> {
  const [hostname, portText] = host.split(':');
  const port = Number(portText);
  if (!hostname || !Number.isInteger(port)) return false;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port });
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

test('connects to the Firestore emulator when configured', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    context.skip('Set FIRESTORE_EMULATOR_HOST or run npm run test:emulator');
    return;
  }
  if (!await emulatorIsReachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Firestore emulator is not reachable');
    return;
  }

  const { initializeFirebase } = await import('../src/config/firebase.js');
  const config = parseEnvironment({
    NODE_ENV: 'test',
    FIREBASE_PROJECT_ID: 'bike-rental-test',
    JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  });
  const { firestore } = initializeFirebase(config);
  const reference = firestore.collection('stage_c1_checks').doc('connectivity');
  await reference.set({ status: 'ok' });
  assert.deepEqual((await reference.get()).data(), { status: 'ok' });
  await reference.delete();
});

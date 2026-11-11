import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { initializeFirebase } from '../src/config/firebase.js';

const config = parseEnvironment({
  NODE_ENV: 'test',
  FIREBASE_PROJECT_ID: 'bike-rental-test',
  JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
  JWT_EXPIRATION_MS: '60000',
  BCRYPT_ROUNDS: '4',
  ...(process.env.FIRESTORE_EMULATOR_HOST
    ? { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST }
    : {}),
});

async function request(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function emulatorIsReachable(host: string): Promise<boolean> {
  const [hostname, portText] = host.split(':');
  const port = Number(portText);
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

test('authentication integration scenarios', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST ||
      !await emulatorIsReachable(process.env.FIRESTORE_EMULATOR_HOST)) {
    context.skip('Run with the Firestore emulator');
    return;
  }
  const { firestore } = initializeFirebase(config);
  await firestore.recursiveDelete(firestore.collection('app_users'));
  await firestore.recursiveDelete(firestore.collection('unique_keys'));
  const app = createApp(config, firestore);

  const bootstrapRequest = (email: string) => request(app, '/api/v1/auth/bootstrap-owner', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'password123', fullName: 'Owner' }),
  });
  const bootstrapResults = await Promise.all([
    bootstrapRequest('owner@example.com'),
    bootstrapRequest('other@example.com'),
  ]);
  assert.deepEqual(bootstrapResults.map((result) => result.status).sort(), [201, 409]);
  const first = bootstrapResults.find((result) => result.status === 201)!;
  const createdUser = first.body.user as Record<string, unknown>;
  assert.equal(createdUser.passwordHash, undefined);
  const loginEmail = String(createdUser.email);
  assert.equal(first.body.accessToken !== undefined, true);

  const userDocument = (await firestore.collection('app_users').limit(1).get()).docs[0];
  assert.ok(userDocument);
  await userDocument.ref.update({ isActive: false });
  const inactiveBootstrap = await bootstrapRequest('inactive-existing@example.com');
  assert.equal(inactiveBootstrap.status, 409);
  await userDocument.ref.update({ isActive: true });

  const badPassword = await request(app, '/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'owner@example.com', password: 'wrong-password' }),
  });
  assert.equal(badPassword.status, 401);
  const unknownUser = await request(app, '/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'missing@example.com', password: 'password123' }),
  });
  assert.equal(unknownUser.status, 401);

  const missingEmail = await request(app, '/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password: 'password123' }),
  });
  assert.equal(missingEmail.status, 400);

  const noToken = await request(app, '/api/v1/auth/profile');
  assert.equal(noToken.status, 401);

  const malformed = await request(app, '/api/v1/auth/profile', {
    headers: { Authorization: 'Basic token' },
  });
  assert.equal(malformed.status, 401);

  const login = await request(app, '/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: loginEmail, password: 'password123' }),
  });
  assert.equal(login.status, 200);
  const token = String(login.body.accessToken);
  const expiredToken = jwt.sign({
    userId: createdUser.id,
    role: 'ROLE_OWNER',
    lang: 'en',
    authVersion: 0,
  }, config.jwtSecret, {
    algorithm: 'HS256',
    subject: loginEmail,
    expiresIn: -1,
  });
  const expired = await request(app, '/api/v1/auth/profile', {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(expired.status, 401);
  const profile = await request(app, '/api/v1/auth/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(profile.status, 200);
  assert.equal((profile.body as Record<string, unknown>).passwordHash, undefined);

  await userDocument.ref.update({ isActive: false });
  const inactiveLogin = await request(app, '/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: loginEmail, password: 'password123' }),
  });
  assert.equal(inactiveLogin.status, 401);
  await userDocument.ref.update({ isActive: true, authVersion: 1 });
  const revoked = await request(app, '/api/v1/auth/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(revoked.status, 401);

  const userSnapshot = await firestore.collection('app_users').limit(1).get();
  const userData = userSnapshot.docs[0]!.data();
  assert.match(String(userData.passwordHash), /^\$2[aby]\$\d\d\$/);
  assert.equal(await bcrypt.compare('password123', String(userData.passwordHash)), true);
});

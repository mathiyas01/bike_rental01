import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Firestore } from 'firebase-admin/firestore';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { configureHttpServer, registerGracefulShutdown } from '../src/config/http-server.js';

test('GET /health returns a healthy response', async () => {
  const app = createApp(parseEnvironment({
    NODE_ENV: 'test',
    FIREBASE_PROJECT_ID: 'bike-rental-test',
    JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
    CORS_ORIGINS: 'http://localhost:3000',
  }));
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'bike-rental-firebase-backend',
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('HTTP security headers and CORS allow-list are applied across API and error responses', async () => {
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'bike-rental-prod',
      JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
      CORS_ORIGINS: '',
    }),
    /CORS_ORIGINS must contain at least one origin in production/,
  );

  const app = createApp(
    parseEnvironment({
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'bike-rental-test',
      JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
      CORS_ORIGINS: 'http://localhost:5173',
    }),
    {} as Firestore,
  );
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Auth endpoint (400 validation error) receives security headers, Cache-Control: no-store, and no X-Powered-By
    const authErrorRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      body: JSON.stringify({}),
    });
    assert.equal(authErrorRes.status, 400);
    assert.equal(authErrorRes.headers.get('x-powered-by'), null);
    assert.equal(authErrorRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(authErrorRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(authErrorRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(authErrorRes.headers.get('cache-control'), 'no-store');
    assert.equal(authErrorRes.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(authErrorRes.headers.get('access-control-expose-headers'), 'Authorization,Content-Disposition');
    assert.equal(authErrorRes.headers.get('access-control-allow-credentials'), null);

    // Operational endpoint (401 unauthenticated error) receives security headers & Cache-Control: no-store
    const opErrorRes = await fetch(`${baseUrl}/api/v1/bikes`, {
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(opErrorRes.status, 401);
    assert.equal(opErrorRes.headers.get('x-powered-by'), null);
    assert.equal(opErrorRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(opErrorRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(opErrorRes.headers.get('cache-control'), 'no-store');

    // Preflight OPTIONS for allowed origin
    const preflightAllowed = await fetch(`${baseUrl}/api/v1/bikes`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'Authorization,Content-Type',
      },
    });
    assert.equal(preflightAllowed.status, 204);
    assert.equal(preflightAllowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(preflightAllowed.headers.get('access-control-max-age'), '3600');
    assert.match(preflightAllowed.headers.get('access-control-allow-methods') ?? '', /POST/);

    // Unconfigured origin does not receive Access-Control-Allow-Origin
    const disallowedRes = await fetch(`${baseUrl}/api/v1/bikes`, {
      headers: { origin: 'https://evil.example.com' },
    });
    assert.equal(disallowedRes.status, 401);
    assert.equal(disallowedRes.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('Stage C8.6 hardening: malformed JSON 400, auth rate limits, readiness probe, finish logging, and graceful shutdown', async () => {
  // 1. Readiness without Firestore -> 503 while liveness /health -> 200
  const noDbApp = createApp(parseEnvironment({
    NODE_ENV: 'test',
    FIREBASE_PROJECT_ID: 'bike-rental-test',
    JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
  }));
  const noDbServer = noDbApp.listen(0);
  try {
    const addr = noDbServer.address();
    assert.ok(addr && typeof addr !== 'string');
    const live = await fetch(`http://127.0.0.1:${addr.port}/health`);
    assert.equal(live.status, 200);
    const ready = await fetch(`http://127.0.0.1:${addr.port}/health/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), {
      status: 'unavailable',
      service: 'bike-rental-firebase-backend',
      firestore: 'error',
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      noDbServer.close((error) => error ? reject(error) : resolve());
    });
  }

  // 2. Readiness with mock Firestore (200 ok, then 503 on error), malformed JSON 400, finish logging, and rate limits
  let shouldFailDb = false;
  const mockFirestore = {
    collection: () => ({
      limit: () => ({
        get: async () => {
          if (shouldFailDb) throw new Error('Firestore unreachable');
          return { empty: true, docs: [] };
        },
      }),
    }),
  } as unknown as Firestore;

  const app = createApp(
    parseEnvironment({
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'bike-rental-test',
      JWT_SECRET: 'local-test-secret-with-at-least-32-bytes',
      AUTH_RATE_LIMIT_MAX: '2',
      BOOTSTRAP_RATE_LIMIT_MAX: '2',
    }),
    mockFirestore,
  );
  const server = app.listen(0);
  configureHttpServer(server);
  assert.equal(server.keepAliveTimeout, 65_000);
  assert.equal(server.headersTimeout, 66_000);
  assert.equal(server.requestTimeout, 30_000);

  const shutdownEmitter = new EventEmitter();
  let exitedWith: number | undefined;
  registerGracefulShutdown(server, {
    processTarget: shutdownEmitter as unknown as Pick<NodeJS.Process, 'on'>,
    onExit: (code) => { exitedWith = code; },
  });

  const loggedEvents: Array<Record<string, unknown>> = [];
  const originalInfo = console.info;
  console.info = (message?: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string' && message.startsWith('{')) {
      try { loggedEvents.push(JSON.parse(message) as Record<string, unknown>); } catch { /* ignore */ }
    }
    originalInfo(message, ...rest);
  };

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const readyOk = await fetch(`${baseUrl}/health/ready`);
    assert.equal(readyOk.status, 200);
    assert.deepEqual(await readyOk.json(), {
      status: 'ready',
      service: 'bike-rental-firebase-backend',
      firestore: 'ok',
    });

    shouldFailDb = true;
    const readyErr = await fetch(`${baseUrl}/health/ready`);
    assert.equal(readyErr.status, 503);

    // Malformed JSON returns 400 BAD_REQUEST and finish event logs final status 400
    const badJson = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email": ',
    });
    assert.equal(badJson.status, 400);
    const badJsonBody = await badJson.json() as Record<string, unknown>;
    assert.equal(badJsonBody.error, 'BAD_REQUEST');
    assert.equal(badJsonBody.message, 'Malformed JSON request body');
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(loggedEvents.some((entry) => entry.event === 'request' && entry.status === 400));

    // Login rate limiting: 1st & 2nd valid-JSON requests hit controller (400 validation), 3rd is rate-limited (429)
    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    }
    const login3 = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(login3.status, 429);
    assert.equal((await login3.json() as Record<string, unknown>).error, 'TOO_MANY_REQUESTS');

    // Bootstrap rate limiting: 1st & 2nd pass through (400 validation), 3rd is rate-limited (429)
    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${baseUrl}/api/v1/auth/bootstrap-owner`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    }
    const boot3 = await fetch(`${baseUrl}/api/v1/auth/bootstrap-owner`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(boot3.status, 429);
    assert.equal((await boot3.json() as Record<string, unknown>).error, 'TOO_MANY_REQUESTS');

    // Graceful shutdown closes server on SIGTERM and exits with 0
    shutdownEmitter.emit('SIGTERM');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    assert.equal(exitedWith, 0);
  } finally {
    console.info = originalInfo;
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';

test('GET /health returns a healthy response', async () => {
  const app = createApp(parseEnvironment({
    NODE_ENV: 'test',
    FIREBASE_PROJECT_ID: 'bike-rental-test',
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

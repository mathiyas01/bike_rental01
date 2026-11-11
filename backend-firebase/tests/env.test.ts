import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvironment } from '../src/config/env.js';

test('invalid environment configuration fails clearly', () => {
  assert.throws(
    () => parseEnvironment({ NODE_ENV: 'production' }),
    /FIREBASE_PROJECT_ID is required/,
  );
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'development',
      FIREBASE_PROJECT_ID: 'local',
      PORT: 'not-a-port',
    }),
    /PORT must be an integer/,
  );
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'test',
      FIREBASE_PROJECT_ID: 'local',
    }),
    /JWT_SECRET is required/,
  );
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'local',
      JWT_SECRET: 'local-secret-with-at-least-32-bytes',
      ENABLE_DEV_PASSWORD_RESET: 'true',
    }),
    /cannot be enabled in production/,
  );
});

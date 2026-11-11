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
});

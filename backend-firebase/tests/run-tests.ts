import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const tests = [
  'env.test.js',
  'health.test.js',
  'jwt.test.js',
  'c3.unit.test.js',
  'c3.contract.test.js',
  'firestore-emulator.test.js',
  'auth.test.js',
  'rental.test.js',
];

for (const testFile of tests) {
  const result = spawnSync(process.execPath, ['--test', join(directory, testFile)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

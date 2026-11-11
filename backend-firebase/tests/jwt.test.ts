import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { JwtService } from '../src/auth/jwt.service.js';
import type { AppConfig } from '../src/config/env.js';
import type { UserDocument } from '../src/auth/types.js';

const config: AppConfig = {
  environment: 'test',
  port: 8082,
  corsOrigins: [],
  firebaseProjectId: 'test',
  jwtSecret: 'local-test-secret-with-at-least-32-bytes',
  jwtExpirationMs: 86400000,
  bcryptRounds: 4,
  enableDevPasswordReset: false,
  logLevel: 'info',
};

const user: UserDocument = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'owner@example.com',
  emailNormalized: 'owner@example.com',
  passwordHash: '$2b$04$6K9L1y4s4i3N0bD6Dq6T5eE6xw6m1X6L7mQ8v5W4a3Q2n1P0o9R8S',
  fullName: 'Owner',
  role: 'ROLE_OWNER',
  preferredLanguage: 'en',
  preferredCurrency: 'RON',
  isActive: true,
  authVersion: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

test('JWT uses the configured algorithm and Java-compatible claims', () => {
  const service = new JwtService(config);
  const token = service.issue(user);
  const decoded = jwt.decode(token, { complete: true });
  assert.ok(decoded && typeof decoded !== 'string');
  const payload = decoded.payload as jwt.JwtPayload & Record<string, unknown>;
  assert.equal(decoded.header.alg, service.getAlgorithm());
  assert.equal(decoded.header.typ, 'JWT');
  assert.equal(payload.sub, user.emailNormalized);
  assert.equal(payload.userId, user.id);
  assert.equal(payload.role, user.role);
  assert.equal(payload.lang, user.preferredLanguage);
  assert.equal(typeof payload.iat, 'number');
  assert.equal(typeof payload.exp, 'number');
  assert.equal(payload.authVersion, 0);
});

test('JWT rejects algorithm confusion, invalid signatures, and missing claims', () => {
  const service = new JwtService(config);
  const valid = service.issue(user);
  assert.doesNotThrow(() => service.validateClaims(service.verify(valid), user));

  const wrongSignature = jwt.sign({ userId: user.id, role: user.role, lang: 'en' },
    'wrong-secret-with-at-least-32-bytes', {
      algorithm: service.getAlgorithm(),
      subject: user.emailNormalized,
    });
  assert.throws(() => service.verify(wrongSignature), /Authentication required/);

  const missingRole = jwt.sign({ userId: user.id, lang: 'en', authVersion: 0 },
    config.jwtSecret, {
      algorithm: service.getAlgorithm(),
      subject: user.emailNormalized,
    });
  assert.throws(
    () => service.validateClaims(service.verify(missingRole), user),
    /Authentication required/,
  );

  const algorithmConfusion = jwt.sign({ userId: user.id, role: user.role, lang: 'en' },
    config.jwtSecret, { algorithm: 'HS384', subject: user.emailNormalized });
  assert.throws(() => service.verify(algorithmConfusion), /Authentication required/);

  const expired = jwt.sign({ userId: user.id, role: user.role, lang: 'en', authVersion: 0 },
    config.jwtSecret, {
      algorithm: service.getAlgorithm(),
      subject: user.emailNormalized,
      expiresIn: -1,
    });
  assert.throws(() => service.verify(expired), /Authentication required/);
});

test('legacy tokens are revoked at the token-issued-before second boundary', () => {
  const service = new JwtService(config);
  const token = service.issue(user);
  const decoded = jwt.decode(token) as { iat: number };
  const revokedUser = { ...user, tokenIssuedBefore: new Date(decoded.iat * 1000) };
  assert.throws(
    () => service.validateClaims(service.verify(token), revokedUser),
    /Authentication required/,
  );
});

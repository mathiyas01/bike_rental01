import { createHash } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { AppConfig } from '../config/env.js';
import { AuthError } from './errors.js';
import type { AuthenticatedUser, UserDocument } from './types.js';

export interface TokenClaims extends JwtPayload {
  userId: string;
  role: string;
  lang: string;
  authVersion?: number;
}

function secretBytes(secret: string): Buffer {
  const normalized = secret.replace(/\s/g, '');
  const decoded = Buffer.from(normalized, 'base64');
  const canonical = decoded.toString('base64').replace(/=+$/, '');
  return /^[A-Za-z0-9+/]*={0,2}$/.test(normalized) &&
    canonical === normalized.replace(/=+$/, '')
    ? decoded
    : Buffer.from(secret, 'utf8');
}

function algorithmForSecret(secret: Buffer): jwt.Algorithm {
  if (secret.length >= 64) return 'HS512';
  if (secret.length >= 48) return 'HS384';
  if (secret.length >= 32) return 'HS256';
  throw new Error('JWT_SECRET must provide at least 256 bits after Base64 decoding or UTF-8 encoding');
}

export class JwtService {
  private readonly key: Buffer;
  private readonly algorithm: jwt.Algorithm;

  constructor(private readonly config: AppConfig) {
    this.key = secretBytes(config.jwtSecret);
    this.algorithm = algorithmForSecret(this.key);
  }

  issue(user: UserDocument): string {
    const options: SignOptions = {
      algorithm: this.algorithm,
      expiresIn: Math.floor(this.config.jwtExpirationMs / 1000),
      subject: user.emailNormalized,
    };
    return jwt.sign({
      userId: user.id,
      role: user.role,
      lang: user.preferredLanguage,
      authVersion: user.authVersion,
    }, this.key, options);
  }

  verify(token: string): TokenClaims {
    try {
      const result = jwt.verify(token, this.key, {
        algorithms: [this.algorithm],
      });
      if (typeof result === 'string') throw new Error('JWT payload must be an object');
      return result as TokenClaims;
    } catch {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
    }
  }

  validateClaims(claims: TokenClaims, user: UserDocument): AuthenticatedUser {
    if (!claims.sub || typeof claims.sub !== 'string' ||
        claims.sub !== user.emailNormalized ||
        claims.userId !== user.id ||
        claims.role !== user.role ||
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        !user.isActive ||
        user.role !== 'ROLE_OWNER') {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (claims.authVersion !== undefined &&
        (!Number.isInteger(claims.authVersion) || claims.authVersion !== user.authVersion)) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (user.tokenIssuedBefore &&
        claims.iat <= Math.floor(user.tokenIssuedBefore.getTime() / 1000)) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    return {
      id: user.id,
      email: user.emailNormalized,
      role: user.role,
      authVersion: user.authVersion,
      issuedAt: claims.iat,
    };
  }

  getAlgorithm(): jwt.Algorithm {
    return this.algorithm;
  }
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function emailLockHash(emailNormalized: string): string {
  return createHash('sha256').update(emailNormalized, 'utf8').digest('hex');
}

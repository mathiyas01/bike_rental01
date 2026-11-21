import type { NextFunction, Response } from 'express';
import type { AppConfig } from '../config/env.js';
import { AuthError } from '../auth/errors.js';
import { JwtService } from '../auth/jwt.service.js';
import { UserRepository } from '../auth/user.repository.js';
import type { AuthenticatedRequest } from '../auth/types.js';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export function createAuthMiddleware(firestore: Firestore, config: AppConfig) {
  const jwt = new JwtService(config);
  const users = new UserRepository(firestore);

  return async (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    try {
      const header = request.header('Authorization');
      if (!header || !header.startsWith('Bearer ') || !header.slice(7).trim()) {
        throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      if (config.environment !== 'test') {
        const decoded = await getAuth().verifyIdToken(header.slice(7).trim(), true);
        const user = await users.findById(decoded.uid);
        if (!user || !user.isActive || decoded.email?.toLowerCase() !== user.emailNormalized) {
          throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
        }
        request.authenticatedUser = {
          id: user.id,
          email: user.emailNormalized,
          role: user.role,
          authVersion: user.authVersion,
          issuedAt: decoded.iat,
        };
        next();
        return;
      }
      const claims = jwt.verify(header.slice(7).trim());
      const userId = claims.userId;
      if (typeof userId !== 'string') {
        throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
      }
      const user = await users.findById(userId);
      if (!user) throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
      request.authenticatedUser = jwt.validateClaims(claims, user);
      next();
    } catch (error) {
      next(error);
    }
  };
}

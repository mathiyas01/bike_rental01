import type { NextFunction, Response } from 'express';
import { AuthError } from '../auth/errors.js';
import type { AuthenticatedRequest } from '../auth/types.js';

export function ownerMiddleware(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): void {
  if (request.authenticatedUser?.role !== 'ROLE_OWNER') {
    next(new AuthError(403, 'FORBIDDEN', 'Access denied'));
    return;
  }
  next();
}

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { AuthService } from '../auth/auth.service.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';

function createAuthRateLimiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (request, response) => {
      response.status(429).json({
        timestamp: new Date().toISOString(),
        status: 429,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts, please try again later',
        path: request.path,
      });
    },
  });
}

export function createAuthRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const service = new AuthService(firestore, config);
  const controller = createAuthController(service);
  const authenticate = createAuthMiddleware(firestore, config);
  const windowMs = config.authRateLimitWindowMs ?? 900_000;
  const loginLimiter = createAuthRateLimiter(windowMs, config.authRateLimitMax ?? 20);

  router.post('/login', loginLimiter, controller.login);
  router.use(authenticate);
  if (config.enableDevPasswordReset) {
    router.post('/reset-password', ownerMiddleware, controller.resetPassword);
  }
  router.get('/profile', controller.profile);
  router.patch('/profile/language', controller.updateLanguage);
  router.patch('/profile/currency', controller.updateCurrency);
  return router;
}

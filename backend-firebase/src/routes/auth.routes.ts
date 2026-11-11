import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { AuthService } from '../auth/auth.service.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';

export function createAuthRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const service = new AuthService(firestore, config);
  const controller = createAuthController(service);
  const authenticate = createAuthMiddleware(firestore, config);

  router.post('/login', controller.login);
  router.post('/bootstrap-owner', controller.bootstrap);
  router.use(authenticate, ownerMiddleware);
  if (config.enableDevPasswordReset) router.post('/reset-password', controller.resetPassword);
  router.get('/profile', controller.profile);
  router.patch('/profile/language', controller.updateLanguage);
  router.patch('/profile/currency', controller.updateCurrency);
  return router;
}

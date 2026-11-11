import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { RentalService } from '../rental/rental.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';
import { createRentalController } from '../controllers/rental.controller.js';

export function createRentalRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const service = new RentalService(firestore, config);
  const controller = createRentalController(service);
  router.use(createAuthMiddleware(firestore, config), ownerMiddleware);
  router.post('/', controller.create);
  router.post('/:id/close', controller.close);
  router.put('/:id', controller.update);
  router.get('/:id', controller.get);
  router.get('/', controller.list);
  return router;
}

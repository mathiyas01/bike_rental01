import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { createServicingController } from '../controllers/servicing.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';
import { ServicingService } from '../servicing/servicing.service.js';

export function createServicingRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createServicingController(new ServicingService(firestore));

  // Servicing endpoints enforce ROLE_OWNER authorization (intentional security hardening over Java SecurityConfig).
  router.use(createAuthMiddleware(firestore, config), ownerMiddleware);

  router.post('/', controller.logService);
  // Register /due and /bike/:bikeId before /:id so Express never matches "due" as a service UUID.
  router.get('/due', controller.getDueServices);
  router.get('/bike/:bikeId', controller.getServicesForBike);
  router.get('/:id', controller.getService);
  router.patch('/:id/status', controller.updateServiceStatus);
  router.get('/', controller.searchServices);

  return router;
}

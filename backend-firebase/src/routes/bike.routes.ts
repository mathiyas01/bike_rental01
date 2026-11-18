import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { createBikeController } from '../controllers/bike.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';
import { BikeService } from '../reference/bike.service.js';

export function createBikeRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createBikeController(new BikeService(firestore));

  // Bike endpoints enforce ROLE_OWNER authorization (intentional security hardening over Java SecurityConfig).
  router.use(createAuthMiddleware(firestore, config), ownerMiddleware);

  router.post('/', controller.createBike);
  router.get('/', controller.listBikes);
  router.get('/:id', controller.getBike);
  router.put('/:id', controller.updateBike);
  router.patch('/:id/status', controller.updateBikeStatus);
  router.post('/:id/archive', controller.archiveBike);
  router.post('/:id/unarchive', controller.unarchiveBike);

  return router;
}

import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { RentalService } from '../rental/rental.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';
import { createRentalChargeController } from '../controllers/rental-charge.controller.js';

export function createRentalChargeRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const service = new RentalService(firestore, config);
  const controller = createRentalChargeController(service);
  router.use(createAuthMiddleware(firestore, config), ownerMiddleware);
  router.post('/rental/:rentalId/generate-next', controller.generateNext);
  router.post('/rental/:rentalId/generate-up-to-date', controller.generateUpToDate);
  router.get('/rental/:rentalId', controller.forRental);
  router.get('/due', controller.due);
  router.get('/', controller.list);
  return router;
}

import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { createReadinessController, healthController } from '../controllers/health.controller.js';

export function createHealthRouter(firestore?: Firestore): Router {
  const router = Router();
  router.get('/health', healthController);
  router.get('/health/ready', createReadinessController(firestore));
  return router;
}

export const healthRouter = createHealthRouter();

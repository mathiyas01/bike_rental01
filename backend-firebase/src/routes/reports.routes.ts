import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { createReportsController } from '../controllers/reports.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';
import { ReportsService } from '../reports/reports.service.js';

export function createReportsRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createReportsController(new ReportsService(firestore));

  // Report endpoints enforce ROLE_OWNER authorization (intentional security hardening over Java SecurityConfig).
  router.use(createAuthMiddleware(firestore, config), ownerMiddleware);

  router.get('/dashboard', controller.getDashboardKpis);
  router.get('/fleet-utilization', controller.getFleetUtilization);
  router.get('/date-range', controller.getDateRangeReport);
  router.get('/bike-roi/:bikeId', controller.getBikeRoi);

  return router;
}

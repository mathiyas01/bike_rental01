import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { createReportsController } from '../controllers/reports.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ReportsService } from '../reports/reports.service.js';

export function createReportsRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createReportsController(new ReportsService(firestore));

  // Report routes require authentication only (no ownerMiddleware), matching Java SecurityConfig/ReportController.
  router.use(createAuthMiddleware(firestore, config));

  router.get('/dashboard', controller.getDashboardKpis);
  router.get('/fleet-utilization', controller.getFleetUtilization);
  router.get('/date-range', controller.getDateRangeReport);
  router.get('/bike-roi/:bikeId', controller.getBikeRoi);

  return router;
}

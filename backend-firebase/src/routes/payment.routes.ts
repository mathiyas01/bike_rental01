import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { createPaymentController } from '../controllers/payment.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';
import { PaymentService } from '../payment/payment.service.js';

export function createPaymentRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const service = new PaymentService(firestore, config);
  const controller = createPaymentController(service);

  // Payment endpoints enforce ROLE_OWNER authorization (intentional security hardening over Java SecurityConfig).
  router.use(createAuthMiddleware(firestore, config), ownerMiddleware);

  router.post('/', controller.recordPayment);
  router.post('/:id/reverse', controller.reversePayment);
  router.get('/customer/:customerId', controller.getPaymentsForCustomer);
  router.get('/rental/:rentalId', controller.getPaymentsForRental);
  router.get('/balance-summary/:customerId', controller.getCustomerBalanceSummary);
  router.get('/:id', controller.getPayment);
  router.get('/', controller.searchPayments);

  return router;
}

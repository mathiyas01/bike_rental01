import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { createCustomerController } from '../controllers/customer.controller.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { ownerMiddleware } from '../middleware/owner.middleware.js';
import { PaymentService } from '../payment/payment.service.js';
import { CustomerService } from '../reference/customer.service.js';

export function createCustomerRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createCustomerController(
    new CustomerService(firestore),
    new PaymentService(firestore, config),
  );

  // Customer endpoints enforce ROLE_OWNER authorization (intentional security hardening over Java SecurityConfig).
  router.use(createAuthMiddleware(firestore, config), ownerMiddleware);

  router.post('/', controller.createCustomer);
  router.get('/', controller.listCustomers);
  router.get('/:id/balance-summary', controller.getCustomerBalanceSummary);
  router.get('/:id', controller.getCustomer);
  router.put('/:id', controller.updateCustomer);
  router.post('/:id/archive', controller.archiveCustomer);
  router.post('/:id/unarchive', controller.unarchiveCustomer);

  return router;
}

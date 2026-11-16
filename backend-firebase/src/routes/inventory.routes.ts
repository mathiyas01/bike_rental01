import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { createInventoryController } from '../controllers/inventory.controller.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';

export function createPartRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createInventoryController(new InventoryService(firestore));

  // Inventory routes require authentication only (no ownerMiddleware), matching Java SecurityConfig.
  router.use(createAuthMiddleware(firestore, config));

  router.post('/', controller.createPart);
  // Register /low-stock before /:id so Express never matches "low-stock" as a part UUID.
  router.get('/low-stock', controller.getLowStockParts);
  router.put('/:id', controller.updatePart);
  router.get('/:id', controller.getPart);
  router.get('/', controller.listParts);
  router.post('/:id/archive', controller.archivePart);
  router.post('/:id/unarchive', controller.unarchivePart);

  return router;
}

export function createStockMovementRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createInventoryController(new InventoryService(firestore));

  router.use(createAuthMiddleware(firestore, config));

  router.post('/', controller.recordStockMovement);
  router.get('/part/:partId', controller.getMovementsForPart);
  router.get('/', controller.searchStockMovements);

  return router;
}

export function createSupplierRouter(firestore: Firestore, config: AppConfig): Router {
  const router = Router();
  const controller = createInventoryController(new InventoryService(firestore));

  router.use(createAuthMiddleware(firestore, config));

  router.post('/', controller.createSupplier);
  router.get('/', controller.listSuppliers);
  router.get('/:id', controller.getSupplier);
  router.post('/:id/archive', controller.archiveSupplier);
  router.post('/:id/unarchive', controller.unarchiveSupplier);

  return router;
}

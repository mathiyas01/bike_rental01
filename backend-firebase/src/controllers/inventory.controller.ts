import type { Response } from 'express';
import { AuthError } from '../auth/errors.js';
import type { AuthenticatedRequest } from '../auth/types.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { requireUuid } from '../shared/ids.js';

function requireAuthenticatedUser(request: AuthenticatedRequest) {
  if (!request.authenticatedUser) {
    throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return request.authenticatedUser;
}

export function createInventoryController(service: InventoryService) {
  return {
    createPart: async (request: AuthenticatedRequest, response: Response) => {
      const authUser = requireAuthenticatedUser(request);
      response.status(201).json(await service.createPart(request.body, authUser));
    },
    updatePart: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.updatePart(requireUuid(request.params.id, 'id'), request.body),
      );
    },
    getPart: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getPartById(requireUuid(request.params.id, 'id')),
      );
    },
    listParts: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.listParts(request.query as Record<string, unknown>),
      );
    },
    getLowStockParts: async (_request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.getLowStockParts());
    },
    archivePart: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.archivePart(requireUuid(request.params.id, 'id')),
      );
    },
    unarchivePart: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.unarchivePart(requireUuid(request.params.id, 'id')),
      );
    },
    recordStockMovement: async (request: AuthenticatedRequest, response: Response) => {
      const authUser = requireAuthenticatedUser(request);
      response.status(201).json(await service.recordStockMovement(request.body, authUser));
    },
    getMovementsForPart: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getMovementsForPart(requireUuid(request.params.partId, 'partId')),
      );
    },
    searchStockMovements: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.searchStockMovements(request.query as Record<string, unknown>),
      );
    },
    createSupplier: async (request: AuthenticatedRequest, response: Response) => {
      response.status(201).json(await service.createSupplier(request.body));
    },
    listSuppliers: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.listSuppliers(request.query as Record<string, unknown>),
      );
    },
    getSupplier: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getSupplierById(requireUuid(request.params.id, 'id')),
      );
    },
    archiveSupplier: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.archiveSupplier(requireUuid(request.params.id, 'id')),
      );
    },
    unarchiveSupplier: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.unarchiveSupplier(requireUuid(request.params.id, 'id')),
      );
    },
  };
}

import type { Response } from 'express';
import { AuthError } from '../auth/errors.js';
import type { AuthenticatedRequest } from '../auth/types.js';
import { ServicingService } from '../servicing/servicing.service.js';
import { requireUuid } from '../shared/ids.js';

function requireAuthenticatedUser(request: AuthenticatedRequest) {
  if (!request.authenticatedUser) {
    throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return request.authenticatedUser;
}

export function createServicingController(service: ServicingService) {
  return {
    logService: async (request: AuthenticatedRequest, response: Response) => {
      const authUser = requireAuthenticatedUser(request);
      response.status(201).json(await service.logService(request.body, authUser));
    },
    getService: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getServiceById(requireUuid(request.params.id, 'id')),
      );
    },
    getServicesForBike: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getServicesForBike(requireUuid(request.params.bikeId, 'bikeId')),
      );
    },
    searchServices: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.searchServices(request.query as Record<string, unknown>),
      );
    },
    getDueServices: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getDueServices(request.query as Record<string, unknown>),
      );
    },
    updateServiceStatus: async (request: AuthenticatedRequest, response: Response) => {
      const authUser = requireAuthenticatedUser(request);
      response.status(200).json(
        await service.updateServiceStatus(
          requireUuid(request.params.id, 'id'),
          request.body,
          authUser,
        ),
      );
    },
  };
}

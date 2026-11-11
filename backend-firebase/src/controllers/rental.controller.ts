import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/types.js';
import { RentalService } from '../rental/rental.service.js';
import { requireUuid } from '../shared/ids.js';

export function createRentalController(service: RentalService) {
  return {
    create: async (request: AuthenticatedRequest, response: Response) => {
      response.status(201).json(await service.create(request.body as Record<string, unknown>));
    },
    close: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.close(
        requireUuid(request.params.id, 'id'),
        request.body as Record<string, unknown>,
      ));
    },
    update: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.update(
        requireUuid(request.params.id, 'id'),
        request.body as Record<string, unknown>,
      ));
    },
    get: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.get(requireUuid(request.params.id, 'id')));
    },
    list: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.list(request.query as Record<string, unknown>));
    },
  };
}

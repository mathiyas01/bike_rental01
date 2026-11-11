import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/types.js';
import { RentalService } from '../rental/rental.service.js';
import { requireUuid } from '../shared/ids.js';

export function createRentalChargeController(service: RentalService) {
  return {
    generateNext: async (request: AuthenticatedRequest, response: Response) => {
      const result = await service.generateNext(requireUuid(request.params.rentalId, 'rentalId'));
      response.status(201).json(result.dto);
    },
    generateUpToDate: async (request: AuthenticatedRequest, response: Response) => {
      response.status(201).json(await service.generateUpToDate(
        requireUuid(request.params.rentalId, 'rentalId'),
        request.query.targetDate,
      ));
    },
    forRental: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.chargesForRental(requireUuid(request.params.rentalId, 'rentalId')));
    },
    due: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.dueCharges(request.query.asOfDate));
    },
    list: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.listCharges(request.query as Record<string, unknown>));
    },
  };
}

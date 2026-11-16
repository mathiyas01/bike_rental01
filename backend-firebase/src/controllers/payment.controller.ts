import type { Response } from 'express';
import { AuthError } from '../auth/errors.js';
import type { AuthenticatedRequest } from '../auth/types.js';
import { PaymentService } from '../payment/payment.service.js';
import { requireUuid } from '../shared/ids.js';

function requireAuthenticatedUser(request: AuthenticatedRequest) {
  if (!request.authenticatedUser) {
    throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return request.authenticatedUser;
}

export function createPaymentController(service: PaymentService) {
  return {
    recordPayment: async (request: AuthenticatedRequest, response: Response) => {
      const authUser = requireAuthenticatedUser(request);
      response.status(201).json(await service.recordPayment(request.body, authUser));
    },
    reversePayment: async (request: AuthenticatedRequest, response: Response) => {
      const authUser = requireAuthenticatedUser(request);
      response.status(200).json(
        await service.reversePayment(
          requireUuid(request.params.id, 'id'),
          request.body,
          authUser,
        ),
      );
    },
    getPayment: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getPaymentById(requireUuid(request.params.id, 'id')),
      );
    },
    searchPayments: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.searchPayments(request.query as Record<string, unknown>),
      );
    },
    getPaymentsForCustomer: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getPaymentsForCustomer(
          requireUuid(request.params.customerId, 'customerId'),
        ),
      );
    },
    getPaymentsForRental: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getPaymentsForRental(
          requireUuid(request.params.rentalId, 'rentalId'),
        ),
      );
    },
    getCustomerBalanceSummary: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getCustomerBalanceSummary(
          requireUuid(request.params.customerId, 'customerId'),
        ),
      );
    },
  };
}

import type { Request, Response } from 'express';
import { PaymentService } from '../payment/payment.service.js';
import { CustomerService } from '../reference/customer.service.js';
import { requireUuid } from '../shared/ids.js';

export function createCustomerController(
  customerService: CustomerService,
  paymentService: PaymentService,
) {
  return {
    createCustomer: async (request: Request, response: Response) => {
      response.status(201).json(await customerService.createCustomer(request.body));
    },
    listCustomers: async (request: Request, response: Response) => {
      response.status(200).json(
        await customerService.listCustomers(request.query as Record<string, unknown>),
      );
    },
    getCustomer: async (request: Request, response: Response) => {
      response.status(200).json(
        await customerService.getCustomerById(requireUuid(request.params.id, 'id')),
      );
    },
    updateCustomer: async (request: Request, response: Response) => {
      response.status(200).json(
        await customerService.updateCustomer(requireUuid(request.params.id, 'id'), request.body),
      );
    },
    archiveCustomer: async (request: Request, response: Response) => {
      response.status(200).json(
        await customerService.archiveCustomer(requireUuid(request.params.id, 'id')),
      );
    },
    unarchiveCustomer: async (request: Request, response: Response) => {
      response.status(200).json(
        await customerService.unarchiveCustomer(requireUuid(request.params.id, 'id')),
      );
    },
    getCustomerBalanceSummary: async (request: Request, response: Response) => {
      response.status(200).json(
        await paymentService.getCustomerBalanceSummary(requireUuid(request.params.id, 'id')),
      );
    },
  };
}

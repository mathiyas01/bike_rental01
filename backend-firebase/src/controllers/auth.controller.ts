import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/types.js';
import { AuthService } from '../auth/auth.service.js';

export function createAuthController(service: AuthService) {
  return {
    login: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.login(request.body as Record<string, unknown>));
    },
    bootstrap: async (request: AuthenticatedRequest, response: Response) => {
      response.status(201).json(await service.bootstrap(request.body as Record<string, unknown>));
    },
    profile: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.getProfile(request.authenticatedUser!.id));
    },
    updateLanguage: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.updateLanguage(
        request.authenticatedUser!.id,
        request.body as Record<string, unknown>,
      ));
    },
    updateCurrency: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.updateCurrency(
        request.authenticatedUser!.id,
        request.body as Record<string, unknown>,
      ));
    },
    resetPassword: async (request: AuthenticatedRequest, response: Response) => {
      await service.resetPassword(
        request.authenticatedUser!.id,
        request.body as Record<string, unknown>,
      );
      response.status(204).send();
    },
  };
}

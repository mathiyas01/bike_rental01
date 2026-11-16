import type { Request, Response } from 'express';
import { BikeService } from '../reference/bike.service.js';
import { requireUuid } from '../shared/ids.js';

export function createBikeController(service: BikeService) {
  return {
    createBike: async (request: Request, response: Response) => {
      response.status(201).json(await service.createBike(request.body));
    },
    listBikes: async (request: Request, response: Response) => {
      response.status(200).json(
        await service.listBikes(request.query as Record<string, unknown>),
      );
    },
    getBike: async (request: Request, response: Response) => {
      response.status(200).json(
        await service.getBikeById(requireUuid(request.params.id, 'id')),
      );
    },
    updateBike: async (request: Request, response: Response) => {
      response.status(200).json(
        await service.updateBike(requireUuid(request.params.id, 'id'), request.body),
      );
    },
    updateBikeStatus: async (request: Request, response: Response) => {
      response.status(200).json(
        await service.updateBikeStatus(requireUuid(request.params.id, 'id'), request.body),
      );
    },
    archiveBike: async (request: Request, response: Response) => {
      response.status(200).json(
        await service.archiveBike(requireUuid(request.params.id, 'id')),
      );
    },
    unarchiveBike: async (request: Request, response: Response) => {
      response.status(200).json(
        await service.unarchiveBike(requireUuid(request.params.id, 'id')),
      );
    },
  };
}

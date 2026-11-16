import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/types.js';
import { ReportsService } from '../reports/reports.service.js';

export function createReportsController(service: ReportsService) {
  return {
    getDashboardKpis: async (_request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.getDashboardKpis());
    },
    getFleetUtilization: async (_request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(await service.getFleetUtilization());
    },
    getDateRangeReport: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getDateRangeReport(request.query as Record<string, unknown>),
      );
    },
    getBikeRoi: async (request: AuthenticatedRequest, response: Response) => {
      response.status(200).json(
        await service.getBikeRoi(request.params.bikeId),
      );
    },
  };
}

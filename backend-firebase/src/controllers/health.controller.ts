import type { Request, Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';

export function healthController(_request: Request, response: Response): void {
  response.status(200).json({
    status: 'ok',
    service: 'bike-rental-firebase-backend',
  });
}

export function createReadinessController(firestore?: Firestore) {
  return async (_request: Request, response: Response): Promise<void> => {
    if (!firestore) {
      response.status(503).json({
        status: 'unavailable',
        service: 'bike-rental-firebase-backend',
        firestore: 'error',
      });
      return;
    }
    try {
      await firestore.collection('app_users').limit(1).get();
      response.status(200).json({
        status: 'ready',
        service: 'bike-rental-firebase-backend',
        firestore: 'ok',
      });
    } catch {
      response.status(503).json({
        status: 'unavailable',
        service: 'bike-rental-firebase-backend',
        firestore: 'error',
      });
    }
  };
}

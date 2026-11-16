import cors from 'cors';
import express from 'express';
import type { AppConfig } from './config/env.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import type { Firestore } from 'firebase-admin/firestore';
import { createRentalRouter } from './routes/rental.routes.js';
import { createRentalChargeRouter } from './routes/rental-charge.routes.js';
import { createPaymentRouter } from './routes/payment.routes.js';
import {
  createPartRouter,
  createStockMovementRouter,
  createSupplierRouter,
} from './routes/inventory.routes.js';
import { createServicingRouter } from './routes/servicing.routes.js';
import { createReportsRouter } from './routes/reports.routes.js';
import { createBikeRouter } from './routes/bike.routes.js';
import { createCustomerRouter } from './routes/customer.routes.js';

export function createApp(config: AppConfig, firestore?: Firestore) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use((request, _response, next) => {
    const startedAt = Date.now();
    request.on('end', () => {
      console.info(JSON.stringify({
        event: 'request',
        method: request.method,
        path: request.path,
        status: _response.statusCode,
        durationMs: Date.now() - startedAt,
      }));
    });
    next();
  });

  app.use(healthRouter);
  if (firestore) {
    app.use('/api/v1/auth', createAuthRouter(firestore, config));
    app.use('/api/v1/bikes', createBikeRouter(firestore, config));
    app.use('/api/v1/customers', createCustomerRouter(firestore, config));
    app.use('/api/v1/rentals', createRentalRouter(firestore, config));
    app.use('/api/v1/rental-charges', createRentalChargeRouter(firestore, config));
    app.use('/api/v1/payments', createPaymentRouter(firestore, config));
    app.use('/api/v1/parts', createPartRouter(firestore, config));
    app.use('/api/v1/stock-movements', createStockMovementRouter(firestore, config));
    app.use('/api/v1/suppliers', createSupplierRouter(firestore, config));
    app.use('/api/v1/services', createServicingRouter(firestore, config));
    app.use('/api/v1/reports', createReportsRouter(firestore, config));
  }
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}

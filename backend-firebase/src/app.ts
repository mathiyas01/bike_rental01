import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';
import { createHealthRouter } from './routes/health.routes.js';
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
  app.set('trust proxy', config.trustProxy ?? (config.environment === 'production' ? 1 : false));
  app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(cors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Authorization', 'Content-Disposition'],
    credentials: false,
    maxAge: 3600,
  }));
  app.use('/api/v1', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use((request, response, next) => {
    const startedAt = Date.now();
    response.on('finish', () => {
      console.info(JSON.stringify({
        event: 'request',
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      }));
    });
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.use(createHealthRouter(firestore));
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

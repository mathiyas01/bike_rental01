import cors from 'cors';
import express from 'express';
import type { AppConfig } from './config/env.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.routes.js';

export function createApp(config: AppConfig) {
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
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}

import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function jsonError(request: Request, response: Response, status: number, error: string, message: string) {
  response.status(status).json({
    timestamp: new Date().toISOString(),
    status,
    error,
    message,
    path: request.path,
    requestId: response.locals.requestId,
  });
}

export const requestContextMiddleware: RequestHandler = (request, response, next) => {
  const incomingId = request.header('X-Request-Id')?.trim();
  const requestId = incomingId && /^[A-Za-z0-9._-]{8,128}$/.test(incomingId)
    ? incomingId
    : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};

export const apiResponseSecurityMiddleware: RequestHandler = (_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');
  next();
};

export const requireJsonMiddleware: RequestHandler = (request, response, next) => {
  if (!BODY_METHODS.has(request.method)) {
    next();
    return;
  }
  const hasBody = request.headers['content-length'] !== undefined ||
    request.headers['transfer-encoding'] !== undefined;
  if (hasBody && !request.is('application/json')) {
    jsonError(request, response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must use Content-Type: application/json');
    return;
  }
  next();
};

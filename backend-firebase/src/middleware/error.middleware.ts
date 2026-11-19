import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AuthError, ValidationError } from '../auth/errors.js';
import { AppError, ValidationError as SharedValidationError } from '../shared/errors.js';

export interface ErrorResponse {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  requestId?: string;
}

export const notFoundMiddleware: RequestHandler = (request, response) => {
  response.status(404).json({
    timestamp: new Date().toISOString(),
    status: 404,
    error: 'NOT_FOUND',
    message: 'Route not found',
    path: request.path,
    requestId: response.locals.requestId,
  } satisfies ErrorResponse);
};

export const errorMiddleware: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  if (error instanceof AuthError) {
    response.status(error.status).json({
      timestamp: new Date().toISOString(),
      status: error.status,
      error: error.errorCode,
      message: error.message,
      path: request.path,
      requestId: response.locals.requestId,
      ...(error instanceof ValidationError ? { validationErrors: error.validationErrors } : {}),
    });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status).json({
      timestamp: new Date().toISOString(),
      status: error.status,
      error: error.errorCode,
      message: error.message,
      path: request.path,
      requestId: response.locals.requestId,
      ...(error instanceof SharedValidationError ? { validationErrors: error.validationErrors } : {}),
    });
    return;
  }
  if (error instanceof SyntaxError && 'status' in error && (error as { status?: number }).status === 400) {
    response.status(400).json({
      timestamp: new Date().toISOString(),
      status: 400,
      error: 'BAD_REQUEST',
      message: 'Malformed JSON request body',
      path: request.path,
      requestId: response.locals.requestId,
    } satisfies ErrorResponse);
    return;
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    response.status(413).json({
      timestamp: new Date().toISOString(),
      status: 413,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the allowed size',
      path: request.path,
      requestId: response.locals.requestId,
    } satisfies ErrorResponse);
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(JSON.stringify({
    event: 'request_error',
    method: request.method,
    path: request.path,
    message,
    requestId: response.locals.requestId,
  }));
  response.status(500).json({
    timestamp: new Date().toISOString(),
    status: 500,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal server error occurred',
    path: request.path,
    requestId: response.locals.requestId,
  } satisfies ErrorResponse);
};

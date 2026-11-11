export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(
    public readonly validationErrors: Array<{
      field: string;
      rejectedValue: unknown;
      message: string;
    }>,
  ) {
    super(400, 'VALIDATION_FAILED', 'Input validation failed');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} not found: ${id}`);
  }
}

export class BusinessError extends AppError {
  constructor(message: string) {
    super(400, 'BAD_REQUEST', message);
  }
}

export class OperationalError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

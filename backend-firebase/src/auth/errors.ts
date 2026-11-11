export class AuthError extends Error {
  public readonly status: number;
  public readonly errorCode: string;

  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

export class ValidationError extends AuthError {
  public readonly validationErrors: Array<{
    field: string;
    rejectedValue: unknown;
    message: string;
  }>;

  constructor(
    validationErrors: Array<{
      field: string;
      rejectedValue: unknown;
      message: string;
    }>,
  ) {
    super(400, 'VALIDATION_FAILED', 'Input validation failed');
    this.validationErrors = validationErrors;
  }
}

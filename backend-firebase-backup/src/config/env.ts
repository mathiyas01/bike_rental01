import 'dotenv/config';

export type Environment = 'development' | 'test' | 'production';

export interface AppConfig {
  environment: Environment;
  port: number;
  corsOrigins: string[];
  firebaseProjectId: string;
  firestoreEmulatorHost?: string;
  firebaseAuthEmulatorHost?: string;
  logLevel: string;
}

export interface EnvironmentInput {
  NODE_ENV?: string;
  PORT?: string;
  CORS_ORIGINS?: string;
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
  LOG_LEVEL?: string;
}

const environments = new Set<Environment>(['development', 'test', 'production']);

export function parseEnvironment(input: EnvironmentInput): AppConfig {
  const environment = input.NODE_ENV ?? 'development';
  if (!environments.has(environment as Environment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const port = Number(input.PORT ?? '8082');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const firebaseProjectId = input.FIREBASE_PROJECT_ID?.trim();
  if (!firebaseProjectId) {
    throw new Error('FIREBASE_PROJECT_ID is required');
  }

  const corsOrigins = (input.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (environment === 'production' && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin in production');
  }

  return {
    environment: environment as Environment,
    port,
    corsOrigins,
    firebaseProjectId,
    ...(input.FIRESTORE_EMULATOR_HOST
      ? { firestoreEmulatorHost: input.FIRESTORE_EMULATOR_HOST.trim() }
      : {}),
    ...(input.FIREBASE_AUTH_EMULATOR_HOST
      ? { firebaseAuthEmulatorHost: input.FIREBASE_AUTH_EMULATOR_HOST.trim() }
      : {}),
    logLevel: input.LOG_LEVEL?.trim() || 'info',
  };
}

export function loadConfig(): AppConfig {
  return parseEnvironment(process.env);
}

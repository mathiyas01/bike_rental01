import 'dotenv/config';

export type Environment = 'development' | 'test' | 'production';

export interface AppConfig {
  environment: Environment;
  port: number;
  corsOrigins: string[];
  firebaseProjectId: string;
  firestoreEmulatorHost?: string;
  firebaseAuthEmulatorHost?: string;
  jwtSecret: string;
  jwtExpirationMs: number;
  bcryptRounds: number;
  enableDevPasswordReset: boolean;
  logLevel: string;
  trustProxy?: boolean | number;
  authRateLimitWindowMs?: number;
  authRateLimitMax?: number;
}

export interface EnvironmentInput {
  NODE_ENV?: string;
  PORT?: string;
  CORS_ORIGINS?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CONFIG?: string;
  GCLOUD_PROJECT?: string;
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
  JWT_SECRET?: string;
  JWT_EXPIRATION_MS?: string;
  BCRYPT_ROUNDS?: string;
  ENABLE_DEV_PASSWORD_RESET?: string;
  LOG_LEVEL?: string;
  TRUST_PROXY?: string;
  AUTH_RATE_LIMIT_WINDOW_MS?: string;
  AUTH_RATE_LIMIT_MAX?: string;
}

const environments = new Set<Environment>(['development', 'test', 'production']);

function resolveFirebaseProjectId(input: EnvironmentInput): string | undefined {
  const explicit = input.FIREBASE_PROJECT_ID?.trim();
  if (explicit) return explicit;

  const rawConfig = input.FIREBASE_CONFIG?.trim();
  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig) as { projectId?: unknown };
      if (typeof parsed.projectId === 'string' && parsed.projectId.trim()) {
        return parsed.projectId.trim();
      }
    } catch {
      // Ignore malformed FIREBASE_CONFIG and fall back to GCLOUD_PROJECT / validation error.
    }
  }

  const gcloudProject = input.GCLOUD_PROJECT?.trim();
  if (gcloudProject) return gcloudProject;

  return undefined;
}

export function parseEnvironment(input: EnvironmentInput): AppConfig {
  const environment = input.NODE_ENV ?? 'development';
  if (!environments.has(environment as Environment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const port = Number(input.PORT?.trim() || '8082');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const firebaseProjectId = resolveFirebaseProjectId(input);
  if (!firebaseProjectId) {
    throw new Error('FIREBASE_PROJECT_ID is required');
  }

  const jwtSecret = input.JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const jwtExpirationMs = Number(input.JWT_EXPIRATION_MS ?? '86400000');
  if (!Number.isInteger(jwtExpirationMs) || jwtExpirationMs <= 0) {
    throw new Error('JWT_EXPIRATION_MS must be a positive integer');
  }

  const bcryptRounds = Number(input.BCRYPT_ROUNDS ?? '12');
  if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 31) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 4 and 31');
  }

  const resetFlag = input.ENABLE_DEV_PASSWORD_RESET ?? 'false';
  if (resetFlag !== 'true' && resetFlag !== 'false') {
    throw new Error('ENABLE_DEV_PASSWORD_RESET must be true or false');
  }
  const enableDevPasswordReset = resetFlag === 'true';
  if (enableDevPasswordReset && environment === 'production') {
    throw new Error('ENABLE_DEV_PASSWORD_RESET cannot be enabled in production');
  }

  const corsOrigins = (input.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (environment === 'production' && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin in production');
  }

  const authRateLimitWindowMs = Number(input.AUTH_RATE_LIMIT_WINDOW_MS ?? '900000');
  if (!Number.isInteger(authRateLimitWindowMs) || authRateLimitWindowMs <= 0) {
    throw new Error('AUTH_RATE_LIMIT_WINDOW_MS must be a positive integer');
  }

  const authRateLimitMax = Number(input.AUTH_RATE_LIMIT_MAX ?? '20');
  if (!Number.isInteger(authRateLimitMax) || authRateLimitMax <= 0) {
    throw new Error('AUTH_RATE_LIMIT_MAX must be a positive integer');
  }

  const trustProxyRaw = input.TRUST_PROXY?.trim();
  let trustProxy: boolean | number = environment === 'production' ? 1 : false;
  if (trustProxyRaw !== undefined && trustProxyRaw !== '') {
    if (trustProxyRaw === 'true') trustProxy = true;
    else if (trustProxyRaw === 'false') trustProxy = false;
    else {
      const parsedHops = Number(trustProxyRaw);
      if (!Number.isInteger(parsedHops) || parsedHops < 0) {
        throw new Error('TRUST_PROXY must be true, false, or a non-negative integer');
      }
      trustProxy = parsedHops;
    }
  }

  return {
    environment: environment as Environment,
    port,
    corsOrigins,
    firebaseProjectId,
    jwtSecret,
    jwtExpirationMs,
    bcryptRounds,
    enableDevPasswordReset,
    ...(input.FIRESTORE_EMULATOR_HOST
      ? { firestoreEmulatorHost: input.FIRESTORE_EMULATOR_HOST.trim() }
      : {}),
    ...(input.FIREBASE_AUTH_EMULATOR_HOST
      ? { firebaseAuthEmulatorHost: input.FIREBASE_AUTH_EMULATOR_HOST.trim() }
      : {}),
    logLevel: input.LOG_LEVEL?.trim() || 'info',
    trustProxy,
    authRateLimitWindowMs,
    authRateLimitMax,
  };
}

export function loadConfig(overrides: Partial<EnvironmentInput> = {}): AppConfig {
  return parseEnvironment({ ...process.env, ...overrides });
}

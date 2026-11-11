import bcrypt from 'bcrypt';
import type { Firestore } from 'firebase-admin/firestore';
import type { AppConfig } from '../config/env.js';
import { AuthError, ValidationError } from './errors.js';
import { JwtService, normalizeEmail } from './jwt.service.js';
import { UserRepository } from './user.repository.js';
import type { UserDocument, UserProfile } from './types.js';

function profile(user: UserDocument): UserProfile {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    preferredLanguage: user.preferredLanguage,
    preferredCurrency: user.preferredCurrency,
  };
}

function requireString(
  body: Record<string, unknown>,
  field: string,
  message: string,
): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError([{ field, rejectedValue: value ?? null, message }]);
  }
  return value;
}

function validateEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError([{
      field: 'email',
      rejectedValue: email,
      message: 'Must be a valid email address',
    }]);
  }
  return normalized;
}

function validatePassword(password: string, minimum: number): void {
  if (password.length < minimum) {
    throw new ValidationError([{
      field: 'password',
      rejectedValue: '[REDACTED]',
      message: `Password must be at least ${minimum} characters`,
    }]);
  }
}

export class AuthService {
  private readonly users: UserRepository;
  private readonly jwt: JwtService;

  constructor(
    private readonly firestore: Firestore,
    private readonly config: AppConfig,
  ) {
    this.users = new UserRepository(firestore);
    this.jwt = new JwtService(config);
  }

  async login(body: Record<string, unknown>) {
    const email = validateEmail(requireString(body, 'email', 'Email is required'));
    const password = requireString(body, 'password', 'Password is required');
    validatePassword(password, 6);
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive || user.role !== 'ROLE_OWNER' ||
        !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }
    return {
      accessToken: this.jwt.issue(user),
      tokenType: 'Bearer',
      expiresIn: Math.floor(this.config.jwtExpirationMs / 1000),
      user: profile(user),
    };
  }

  async bootstrap(body: Record<string, unknown>) {
    const email = validateEmail(requireString(body, 'email', 'Email is required'));
    const password = requireString(body, 'password', 'Password is required');
    validatePassword(password, 8);
    const fullName = requireString(body, 'fullName', 'Full name is required');
    const preferredLanguage = body.preferredLanguage === undefined
      ? 'en'
      : requireString(body, 'preferredLanguage', 'Preferred language is required');
    if (!['en', 'ro'].includes(preferredLanguage)) {
      throw new ValidationError([{
        field: 'preferredLanguage',
        rejectedValue: preferredLanguage,
        message: "Language must be either 'en' or 'ro'",
      }]);
    }

    try {
      const passwordHash = await bcrypt.hash(password, this.config.bcryptRounds);
      let created!: UserDocument;
      await this.firestore.runTransaction(async (transaction) => {
        created = await this.users.createBootstrapOwner(transaction, {
          email,
          emailNormalized: email,
          passwordHash,
          fullName: fullName.trim(),
          role: 'ROLE_OWNER',
          preferredLanguage,
          preferredCurrency: 'RON',
          isActive: true,
          authVersion: 0,
        });
      });
      return {
        accessToken: this.jwt.issue(created),
        tokenType: 'Bearer',
        expiresIn: Math.floor(this.config.jwtExpirationMs / 1000),
        user: profile(created),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'BOOTSTRAP_ALREADY_INITIALIZED') {
        throw new AuthError(
          409,
          'CONFLICT',
          'Owner account has already been initialized. Please use login instead.',
        );
      }
      throw error;
    }
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) throw new AuthError(404, 'NOT_FOUND', `User not found: ${userId}`);
    return profile(user);
  }

  async updateLanguage(userId: string, body: Record<string, unknown>): Promise<UserProfile> {
    const language = requireString(body, 'preferredLanguage', 'Preferred language is required');
    if (!['en', 'ro'].includes(language)) {
      throw new ValidationError([{
        field: 'preferredLanguage',
        rejectedValue: language,
        message: "Language must be either 'en' or 'ro'",
      }]);
    }
    return profile(await this.users.update(userId, { preferredLanguage: language }));
  }

  async updateCurrency(userId: string, body: Record<string, unknown>): Promise<UserProfile> {
    const currency = requireString(body, 'preferredCurrency', 'Preferred currency is required');
    if (!['RON', 'EUR', 'USD'].includes(currency)) {
      throw new ValidationError([{
        field: 'preferredCurrency',
        rejectedValue: currency,
        message: 'Currency must be one of: RON, EUR, USD',
      }]);
    }
    return profile(await this.users.update(userId, { preferredCurrency: currency }));
  }

  async resetPassword(userId: string, body: Record<string, unknown>): Promise<void> {
    if (!this.config.enableDevPasswordReset) {
      throw new AuthError(404, 'NOT_FOUND', 'Route not found');
    }
    const email = validateEmail(requireString(body, 'email', 'Email is required'));
    const password = requireString(body, 'password', 'Password is required');
    validatePassword(password, 6);
    const user = await this.users.findById(userId);
    if (!user || user.emailNormalized !== email) {
      throw new AuthError(404, 'NOT_FOUND', `User not found: ${email}`);
    }
    await this.users.update(userId, {
      passwordHash: await bcrypt.hash(password, this.config.bcryptRounds),
      authVersion: user.authVersion + 1,
      tokenIssuedBefore: new Date(),
    });
  }
}

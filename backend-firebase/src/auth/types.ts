import type { Request } from 'express';

export interface UserDocument {
  id: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  fullName: string;
  role: string;
  preferredLanguage: string;
  preferredCurrency: string;
  isActive: boolean;
  authVersion: number;
  tokenIssuedBefore?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  preferredLanguage: string;
  preferredCurrency: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  authVersion: number;
  issuedAt: number;
}

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: AuthenticatedUser;
}

import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { UserDocument } from './types.js';
import { emailLockHash } from './jwt.service.js';

const USERS = 'app_users';
const UNIQUE_KEYS = 'unique_keys';
const BOOTSTRAP_LOCK = 'bootstrap_lock';

function fromFirestore(id: string, data: FirebaseFirestore.DocumentData): UserDocument {
  return {
    id,
    email: String(data.email),
    emailNormalized: String(data.emailNormalized),
    passwordHash: String(data.passwordHash),
    fullName: String(data.fullName),
    role: String(data.role),
    preferredLanguage: String(data.preferredLanguage),
    preferredCurrency: String(data.preferredCurrency),
    isActive: data.isActive !== false,
    authVersion: Number.isInteger(data.authVersion) ? data.authVersion : 0,
    ...(data.tokenIssuedBefore ? { tokenIssuedBefore: data.tokenIssuedBefore.toDate() } : {}),
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  };
}

export class UserRepository {
  constructor(private readonly firestore: Firestore) {}

  async findByEmail(emailNormalized: string): Promise<UserDocument | undefined> {
    const snapshot = await this.firestore.collection(USERS)
      .where('emailNormalized', '==', emailNormalized)
      .limit(1)
      .get();
    const document = snapshot.docs[0];
    return document ? fromFirestore(document.id, document.data()) : undefined;
  }

  async findById(id: string): Promise<UserDocument | undefined> {
    const document = await this.firestore.collection(USERS).doc(id).get();
    return document.exists ? fromFirestore(document.id, document.data() ?? {}) : undefined;
  }

  async hasAnyUser(transaction?: Transaction): Promise<boolean> {
    const query = this.firestore.collection(USERS).limit(1);
    const snapshot = transaction ? await transaction.get(query) : await query.get();
    return !snapshot.empty;
  }

  async createBootstrapOwner(
    transaction: Transaction,
    values: Omit<UserDocument, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<UserDocument> {
    const existingUsers = await transaction.get(this.firestore.collection(USERS).limit(1));
    if (!existingUsers.empty) {
      throw new Error('BOOTSTRAP_ALREADY_INITIALIZED');
    }

    const lockReference = this.firestore.collection(UNIQUE_KEYS).doc('bootstrap_lock');
    const lock = await transaction.get(lockReference);
    if (lock.exists) {
      throw new Error('BOOTSTRAP_ALREADY_INITIALIZED');
    }
    const emailLockReference = this.firestore.collection(UNIQUE_KEYS)
      .doc(`email_${emailLockHash(values.emailNormalized)}`);
    const emailLock = await transaction.get(emailLockReference);
    if (emailLock.exists) {
      throw new Error('BOOTSTRAP_ALREADY_INITIALIZED');
    }

    const now = new Date();
    const id = randomUUID();
    const user: UserDocument = { id, ...values, createdAt: now, updatedAt: now };
    const userReference = this.firestore.collection(USERS).doc(id);
    transaction.create(lockReference, {
      fieldType: 'bootstrap',
      normalizedValue: 'bootstrap',
      recordId: id,
      createdAt: now,
    });
    transaction.create(emailLockReference, {
      fieldType: 'email',
      normalizedValue: values.emailNormalized,
      recordId: id,
      createdAt: now,
    });
    transaction.create(userReference, {
      ...values,
      createdAt: now,
      updatedAt: now,
    });
    return user;
  }

  async update(
    id: string,
    update: Record<string, unknown>,
  ): Promise<UserDocument> {
    const reference = this.firestore.collection(USERS).doc(id);
    await reference.update({ ...update, updatedAt: new Date() });
    const user = await this.findById(id);
    if (!user) throw new Error('USER_NOT_FOUND');
    return user;
  }

  async updateInTransaction(
    transaction: Transaction,
    id: string,
    update: Record<string, unknown>,
  ): Promise<void> {
    transaction.update(this.firestore.collection(USERS).doc(id), {
      ...update,
      updatedAt: new Date(),
    });
  }
}

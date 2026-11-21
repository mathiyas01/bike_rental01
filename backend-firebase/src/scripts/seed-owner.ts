import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeEmail } from '../auth/jwt.service.js';
import { UserRepository } from '../auth/user.repository.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseServiceAccount(raw: string): ServiceAccount {
  try {
    const value = JSON.parse(raw) as ServiceAccount;
    if (!value.projectId || !value.clientEmail || !value.privateKey) {
      throw new Error('missing projectId, clientEmail, or privateKey');
    }
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${message}`);
  }
}

async function main() {
  const serviceAccount = parseServiceAccount(required('FIREBASE_SERVICE_ACCOUNT_JSON'));
  const email = normalizeEmail(required('OWNER_EMAIL'));
  const password = required('OWNER_PASSWORD');
  const fullName = required('OWNER_FULL_NAME');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('OWNER_EMAIL is invalid');
  if (password.length < 12) throw new Error('OWNER_PASSWORD must contain at least 12 characters');
  if (fullName.length > 150) throw new Error('OWNER_FULL_NAME must not exceed 150 characters');

  const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
  const firestore = getFirestore(app);
  const auth = getAuth(app);
  const users = new UserRepository(firestore);
  const existing = await users.findByEmail(email);
  if (existing) {
    if (existing.role !== 'ROLE_OWNER' || !existing.isActive) {
      throw new Error('The seeded email exists but is not an active owner');
    }
    console.info(JSON.stringify({ event: 'owner_seed_skipped', reason: 'already_exists' }));
    return;
  }

  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
    if (authUser.disabled) await auth.updateUser(authUser.uid, { disabled: false });
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    authUser = await auth.createUser({ email, password, displayName: fullName, emailVerified: true });
  }
  await auth.setCustomUserClaims(authUser.uid, { role: 'ROLE_OWNER' });

  try {
    await firestore.runTransaction(async (transaction) => {
      await users.createInitialOwner(transaction, {
      id: authUser.uid,
      email,
      emailNormalized: email,
      fullName,
      role: 'ROLE_OWNER',
      preferredLanguage: 'en',
      preferredCurrency: 'RON',
      isActive: true,
      authVersion: 0,
      });
    });
  } catch (error) {
    if ((error as Error).message === 'OWNER_ALREADY_INITIALIZED') {
      console.info(JSON.stringify({ event: 'owner_seed_skipped', reason: 'already_exists' }));
      return;
    }
    throw error;
  }
  console.info(JSON.stringify({ event: 'owner_seeded' }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Owner seed failed';
  console.error(JSON.stringify({ event: 'owner_seed_failed', message }));
  process.exitCode = 1;
});

import type { ClientSession, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { accounts, tokens } from '../../db/schema/index.js';
import type { AccountDoc, AuthProvider } from '../../models/account.model.js';
import type { AuthTokenStatus, AuthTokenType, TokenDoc } from '../../models/token.model.js';

export interface CreateAccountData {
  userId: Types.ObjectId | string;
  provider: AuthProvider;
  password_hash?: string;
  provider_account_id?: string;
}

export interface CreateLocalAccountData {
  userId: Types.ObjectId | string;
  provider: 'local';
}

export interface CreateVerificationTokenData {
  userId: Types.ObjectId | string;
  tokenHash: string;
  expiresAt: Date;
}

export interface CreatePasswordResetTokenData {
  userId: Types.ObjectId | string;
  tokenHash: string;
  expiresAt: Date;
}

function toAccountDoc(row: typeof accounts.$inferSelect): AccountDoc & { password_hash: string } {
  return {
    _id: row.id as unknown as Types.ObjectId,
    user_id: row.user_id as unknown as Types.ObjectId,
    provider: row.provider as AuthProvider,
    provider_account_id: row.provider_account_id ?? undefined,
    password_hash: row.password_hash ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as unknown as AccountDoc & { password_hash: string };
}

function toTokenDoc(row: typeof tokens.$inferSelect): TokenDoc {
  return {
    _id: row.id as unknown as Types.ObjectId,
    user_id: row.user_id as unknown as Types.ObjectId,
    type: row.type as AuthTokenType,
    token_hash: row.token_hash,
    status: row.status as AuthTokenStatus,
    expires_at: row.expires_at,
    consumed_at: row.consumed_at ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as unknown as TokenDoc;
}

export class AuthRepository {
  async withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    const db = getSqliteDb();
    const runInTx = db.transaction((_tx) => {
      // In SQLite, queries using the db instance participate in this transaction
      return operation({} as ClientSession);
    });
    return runInTx;
  }

  async verifyCurrentPassword(
    userId: Types.ObjectId | string,
    rawPassword: string,
    _session?: ClientSession,
  ): Promise<boolean> {
    const db = getSqliteDb();
    const [account] = db
      .select()
      .from(accounts)
      .where(and(eq(accounts.user_id, String(userId)), eq(accounts.provider, 'local')))
      .all();
    return Boolean(account?.password_hash && (await bcrypt.compare(rawPassword, account.password_hash)));
  }

  async createLocalAccount(data: CreateLocalAccountData, _session?: ClientSession): Promise<AccountDoc> {
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(accounts)
      .values({
        id,
        user_id: String(data.userId),
        provider: data.provider,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return toAccountDoc({
      id,
      user_id: String(data.userId),
      provider: data.provider,
      provider_account_id: null,
      password_hash: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async createAccount(data: CreateAccountData): Promise<AccountDoc> {
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(accounts)
      .values({
        id,
        user_id: String(data.userId),
        provider: data.provider,
        password_hash: data.password_hash ?? null,
        provider_account_id: data.provider_account_id ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return toAccountDoc({
      id,
      user_id: String(data.userId),
      provider: data.provider,
      provider_account_id: data.provider_account_id ?? null,
      password_hash: data.password_hash ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async findLocalAccountByUserId(
    userId: Types.ObjectId | string,
    _session?: ClientSession,
  ): Promise<(AccountDoc & { password_hash: string }) | null> {
    const db = getSqliteDb();
    const [account] = db
      .select()
      .from(accounts)
      .where(and(eq(accounts.user_id, String(userId)), eq(accounts.provider, 'local')))
      .all();
    return account ? toAccountDoc(account) : null;
  }

  async findAccountByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<AccountDoc | null> {
    const db = getSqliteDb();
    const [account] = db
      .select()
      .from(accounts)
      .where(and(eq(accounts.provider, provider), eq(accounts.provider_account_id, providerAccountId)))
      .all();
    return account ? toAccountDoc(account) : null;
  }

  async createVerificationToken(data: CreateVerificationTokenData): Promise<TokenDoc> {
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(tokens)
      .values({
        id,
        user_id: String(data.userId),
        type: 'email_verification',
        token_hash: data.tokenHash,
        status: 'pending',
        expires_at: data.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return toTokenDoc({
      id,
      user_id: String(data.userId),
      type: 'email_verification',
      token_hash: data.tokenHash,
      status: 'pending',
      expires_at: data.expiresAt,
      consumed_at: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async findVerificationTokenByHash(tokenHash: string): Promise<TokenDoc | null> {
    const db = getSqliteDb();
    const [token] = db
      .select()
      .from(tokens)
      .where(and(eq(tokens.token_hash, tokenHash), eq(tokens.type, 'email_verification')))
      .all();
    return token ? toTokenDoc(token) : null;
  }

  async createPasswordResetToken(data: CreatePasswordResetTokenData): Promise<TokenDoc> {
    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(tokens)
      .values({
        id,
        user_id: String(data.userId),
        type: 'password_reset',
        token_hash: data.tokenHash,
        status: 'pending',
        expires_at: data.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return toTokenDoc({
      id,
      user_id: String(data.userId),
      type: 'password_reset',
      token_hash: data.tokenHash,
      status: 'pending',
      expires_at: data.expiresAt,
      consumed_at: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async findPasswordResetTokenByHash(tokenHash: string): Promise<TokenDoc | null> {
    const db = getSqliteDb();
    const [token] = db
      .select()
      .from(tokens)
      .where(and(eq(tokens.token_hash, tokenHash), eq(tokens.type, 'password_reset')))
      .all();
    return token ? toTokenDoc(token) : null;
  }

  async markTokenUsed(tokenId: Types.ObjectId | string): Promise<void> {
    const db = getSqliteDb();
    db.update(tokens)
      .set({ status: 'used', consumed_at: new Date() })
      .where(and(eq(tokens.id, String(tokenId)), eq(tokens.status, 'pending')))
      .run();
  }

  async revokePriorVerificationTokens(userId: Types.ObjectId | string): Promise<void> {
    const db = getSqliteDb();
    db.update(tokens)
      .set({ status: 'revoked' })
      .where(and(eq(tokens.user_id, String(userId)), eq(tokens.type, 'email_verification'), eq(tokens.status, 'pending')))
      .run();
  }

  async revokePriorPasswordResetTokens(userId: Types.ObjectId | string): Promise<void> {
    const db = getSqliteDb();
    db.update(tokens)
      .set({ status: 'revoked' })
      .where(and(eq(tokens.user_id, String(userId)), eq(tokens.type, 'password_reset'), eq(tokens.status, 'pending')))
      .run();
  }

  async updateLocalAccountPassword(
    userId: Types.ObjectId | string,
    passwordHash: string,
    _session?: ClientSession,
  ): Promise<void> {
    const db = getSqliteDb();
    const result = db
      .update(accounts)
      .set({ password_hash: passwordHash, updatedAt: new Date() })
      .where(and(eq(accounts.user_id, String(userId)), eq(accounts.provider, 'local')))
      .run();
    if (result.changes !== 1) throw new Error('Local credentials were not found');
  }

  async revokeIdentityTokens(userId: Types.ObjectId | string, _session?: ClientSession): Promise<void> {
    const db = getSqliteDb();
    db.update(tokens)
      .set({ status: 'revoked' })
      .where(and(eq(tokens.user_id, String(userId)), eq(tokens.status, 'pending')))
      .run();
  }
}

export const authRepository = new AuthRepository();

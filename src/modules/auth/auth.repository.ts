import type { ClientSession, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

import { Account, type AccountDoc, type AuthProvider } from '../../models/account.model.js';
import { Token, type TokenDoc } from '../../models/token.model.js';

export interface CreateAccountData {
  userId: Types.ObjectId | string;
  provider: AuthProvider;
  password_hash?: string;
  provider_account_id?: string;
}

export interface CreateLocalAccountData {
  userId: Types.ObjectId;
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

export class AuthRepository {
  async verifyCurrentPassword(userId: Types.ObjectId, rawPassword: string, session?: ClientSession): Promise<boolean> {
    let query = Account.findOne({ user_id: userId, provider: 'local' }).select('+password_hash');
    if (session) query = query.session(session);
    const account = await query.exec() as (AccountDoc & { password_hash: string }) | null;
    return Boolean(account?.password_hash && await bcrypt.compare(rawPassword, account.password_hash));
  }

  async createLocalAccount(data: CreateLocalAccountData, session: ClientSession): Promise<AccountDoc> {
    const [account] = await Account.create([{ user_id: data.userId, provider: data.provider }], { session });
    if (!account) throw new Error('Local account was not created');
    return account;
  }

  async createAccount(data: CreateAccountData): Promise<AccountDoc> {
    const account = new Account({
      user_id: data.userId,
      provider: data.provider,
      ...(data.password_hash ? { password_hash: data.password_hash } : {}),
      ...(data.provider_account_id ? { provider_account_id: data.provider_account_id } : {}),
    });
    return account.save();
  }

  async findLocalAccountByUserId(
    userId: Types.ObjectId | string,
  ): Promise<(AccountDoc & { password_hash: string }) | null> {
    return Account.findOne({
      user_id: userId,
      provider: 'local',
    })
      .select('+password_hash')
      .exec() as Promise<(AccountDoc & { password_hash: string }) | null>;
  }

  async findAccountByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<AccountDoc | null> {
    return Account.findOne({
      provider,
      provider_account_id: providerAccountId,
    }).exec();
  }

  async createVerificationToken(data: CreateVerificationTokenData): Promise<TokenDoc> {
    const token = new Token({
      user_id: data.userId,
      type: 'email_verification',
      token_hash: data.tokenHash,
      status: 'pending',
      expires_at: data.expiresAt,
    });
    return token.save();
  }

  async findVerificationTokenByHash(tokenHash: string): Promise<TokenDoc | null> {
    return Token.findOne({
      token_hash: tokenHash,
      type: 'email_verification',
    }).exec();
  }

  async createPasswordResetToken(data: CreatePasswordResetTokenData): Promise<TokenDoc> {
    const token = new Token({
      user_id: data.userId,
      type: 'password_reset',
      token_hash: data.tokenHash,
      status: 'pending',
      expires_at: data.expiresAt,
    });
    return token.save();
  }

  async findPasswordResetTokenByHash(tokenHash: string): Promise<TokenDoc | null> {
    return Token.findOne({
      token_hash: tokenHash,
      type: 'password_reset',
    }).exec();
  }

  async markTokenUsed(tokenId: Types.ObjectId | string): Promise<void> {
    await Token.updateOne(
      { _id: tokenId, status: 'pending', expires_at: { $gt: new Date() } },
      { $set: { status: 'used', consumed_at: new Date() } },
    ).exec();
  }

  async revokePriorVerificationTokens(userId: Types.ObjectId | string): Promise<void> {
    await Token.updateMany(
      { user_id: userId, type: 'email_verification', status: 'pending' },
      { $set: { status: 'revoked' } },
    ).exec();
  }

  async revokePriorPasswordResetTokens(userId: Types.ObjectId | string): Promise<void> {
    await Token.updateMany(
      { user_id: userId, type: 'password_reset', status: 'pending' },
      { $set: { status: 'revoked' } },
    ).exec();
  }

  async updateLocalAccountPassword(
    userId: Types.ObjectId | string,
    passwordHash: string,
    session?: ClientSession,
  ): Promise<void> {
    const query = Account.updateOne(
      { user_id: userId, provider: 'local' },
      { $set: { password_hash: passwordHash } },
    );
    if (session) query.session(session);
    const result = await query.exec();
    if (result.matchedCount !== 1) throw new Error('Local credentials were not found');
  }

  async revokeIdentityTokens(userId: Types.ObjectId, session: ClientSession): Promise<void> {
    await Token.updateMany({ user_id: userId, status: 'pending' }, { $set: { status: 'revoked' } }, { session }).exec();
  }
}

export const authRepository = new AuthRepository();

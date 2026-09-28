import type { Types } from 'mongoose';

import { Account, type AccountDoc, type AuthProvider } from '../../models/account.model.js';
import { Token, type TokenDoc } from '../../models/token.model.js';

export interface CreateAccountData {
  userId: Types.ObjectId | string;
  provider: AuthProvider;
  password_hash?: string;
  provider_account_id?: string;
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
      { _id: tokenId },
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
  ): Promise<void> {
    await Account.updateOne(
      { user_id: userId, provider: 'local' },
      { $set: { password_hash: passwordHash } },
    ).exec();
  }
}

export const authRepository = new AuthRepository();


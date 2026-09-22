import type { Types } from 'mongoose';

import { Account, type AccountDoc, type AuthProvider } from '../../models/account.model.js';

export interface CreateAccountData {
  userId: Types.ObjectId | string;
  provider: AuthProvider;
  password_hash?: string;
  provider_account_id?: string;
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
}

export const authRepository = new AuthRepository();

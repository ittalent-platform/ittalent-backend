import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { UserInvitationsService } from '../../../src/modules/user-invitations/user-invitations.service.js';
import type { UserInvitationsRepository } from '../../../src/modules/user-invitations/user-invitations.repository.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import type { UserAuditsService } from '../../../src/modules/user-audits/user-audits.service.js';
import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import type { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import type { EnterpriseRegistrationsService } from '../../../src/modules/enterprise-registrations/enterprise-registrations.service.js';
import { sendUserInvitationEmail } from '../../../src/shared/services/email.service.js';

vi.mock('../../../src/shared/services/email.service.js', () => ({ sendUserInvitationEmail: vi.fn() }));

describe('UserInvitationsService', () => {
  beforeEach(() => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (callback: () => Promise<void>) => callback(), endSession: async () => undefined } as never);
  });

  it('stops account creation when enterprise onboarding is pending', async () => {
    const session = { withTransaction: async (callback: () => Promise<void>) => callback(), endSession: async () => undefined };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
    const actor = { _id: new mongoose.Types.ObjectId(), role: 'admin', status: 'active' };
    const users = {
      findById: vi.fn().mockResolvedValue(actor),
      findByIdWithSession: vi.fn().mockResolvedValue(actor),
      existsByEmailOrUsername: vi.fn(),
      lockEnterpriseAdminChanges: vi.fn().mockResolvedValue(true),
      createManagedUser: vi.fn(),
    };
    const enterprises = { isActiveEnterprise: vi.fn().mockResolvedValue(true) };
    const registrations = { hasIncompleteOnboarding: vi.fn().mockResolvedValue(true) };
    const auth = { createPasswordlessLocalAccount: vi.fn() };
    const service = new UserInvitationsService(users as unknown as UsersService, {} as UserInvitationsRepository, {} as UserAuditsService, auth as unknown as AuthService, enterprises as unknown as EnterprisesService, registrations as unknown as EnterpriseRegistrationsService);

    await expect(service.createAccount(String(actor._id), { email: 'corp@example.test', username: 'corpuser', fullName: 'Corporate User', role: 'enterprise_admin', enterpriseId: new mongoose.Types.ObjectId().toHexString() })).rejects.toMatchObject({ statusCode: 409, code: 'ENTERPRISE_ONBOARDING_PENDING' });
    expect(users.findById).not.toHaveBeenCalled();
    expect(users.createManagedUser).not.toHaveBeenCalled();
    expect(auth.createPasswordlessLocalAccount).not.toHaveBeenCalled();
  });

  it('returns a failed delivery state while keeping the newly created account', async () => {
    const actor = { _id: new mongoose.Types.ObjectId(), role: 'admin', status: 'active' };
    const createdUser = {
      _id: new mongoose.Types.ObjectId(), email: 'new@example.test', username: 'newuser', role: 'user', status: 'invited',
      createdAt: new Date(), updatedAt: new Date(), version: 0,
    };
    const users = {
      findById: vi.fn(),
      findByIdWithSession: vi.fn().mockResolvedValue(actor),
      existsByEmailOrUsername: vi.fn().mockResolvedValue(false),
      createManagedUser: vi.fn().mockResolvedValue(createdUser),
      lockEnterpriseAdminChanges: vi.fn(),
    };
    const invitations = { create: vi.fn(), markDelivery: vi.fn().mockResolvedValue(undefined) };
    const audits = { record: vi.fn() };
    const auth = { createPasswordlessLocalAccount: vi.fn() };
    const registrations = { hasIncompleteOnboarding: vi.fn().mockResolvedValue(false) };
    vi.mocked(sendUserInvitationEmail).mockResolvedValue(false);
    const service = new UserInvitationsService(
      users as unknown as UsersService,
      invitations as unknown as UserInvitationsRepository,
      audits as unknown as UserAuditsService,
      auth as unknown as AuthService,
      {} as EnterprisesService,
      registrations as unknown as EnterpriseRegistrationsService,
    );

    const result = await service.createAccount(String(actor._id), {
      email: createdUser.email, username: createdUser.username, fullName: 'New User', role: 'user',
    });

    expect(result).toMatchObject({ user: { id: String(createdUser._id), status: 'invited' }, invitation: { deliveryStatus: 'failed' } });
    expect(users.createManagedUser).toHaveBeenCalledOnce();
    expect(users.findById).not.toHaveBeenCalled();
    expect(invitations.markDelivery).toHaveBeenCalledWith(expect.any(String), false);
  });

  it('normalizes an inactive company to a 409 COMPANY_UNAVAILABLE before opening a transaction', async () => {
    const enterpriseId = new mongoose.Types.ObjectId();
    const users = { findById: vi.fn(), createManagedUser: vi.fn() };
    const enterprises = { isActiveEnterprise: vi.fn().mockResolvedValue(false) };
    const service = new UserInvitationsService(
      users as unknown as UsersService, {} as UserInvitationsRepository, {} as UserAuditsService,
      {} as AuthService, enterprises as unknown as EnterprisesService, {} as EnterpriseRegistrationsService,
    );

    await expect(service.createAccount('admin', {
      email: 'new@example.test', username: 'newuser', fullName: 'New User', role: 'recruiter', enterpriseId: String(enterpriseId),
    })).rejects.toMatchObject({ statusCode: 409, code: 'COMPANY_UNAVAILABLE' });
    expect(users.createManagedUser).not.toHaveBeenCalled();
  });

  it('uses ACCOUNT_CONFLICT for an email-or-username match and never creates the account', async () => {
    const actor = { _id: new mongoose.Types.ObjectId(), role: 'admin', status: 'active' };
    const users = {
      findById: vi.fn(),
      findByIdWithSession: vi.fn().mockResolvedValue(actor),
      existsByEmailOrUsername: vi.fn().mockResolvedValue(true),
      createManagedUser: vi.fn(),
    };
    const registrations = { hasIncompleteOnboarding: vi.fn().mockResolvedValue(false) };
    const service = new UserInvitationsService(
      users as unknown as UsersService,
      {} as UserInvitationsRepository,
      {} as UserAuditsService,
      {} as AuthService,
      {} as EnterprisesService,
      registrations as unknown as EnterpriseRegistrationsService,
    );

    await expect(service.createAccount(String(actor._id), {
      email: 'taken@example.test', username: 'taken', fullName: 'New User', role: 'user',
    })).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_CONFLICT', message: 'The email address or username is already in use' });
    expect(users.createManagedUser).not.toHaveBeenCalled();
  });

  it('maps a duplicate-key race to the same ACCOUNT_CONFLICT response', async () => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async () => { throw Object.assign(new Error('duplicate key'), { code: 11_000 }); },
      endSession: async () => undefined,
    } as never);
    const users = { findById: vi.fn(), findByIdWithSession: vi.fn().mockResolvedValue({ role: 'admin', status: 'active' }) };
    const service = new UserInvitationsService(
      users as unknown as UsersService, {} as UserInvitationsRepository, {} as UserAuditsService,
      {} as AuthService, {} as EnterprisesService, {} as EnterpriseRegistrationsService,
    );

    await expect(service.createAccount('admin', {
      email: 'taken@example.test', username: 'taken', fullName: 'New User', role: 'user',
    })).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_CONFLICT', message: 'The email address or username is already in use' });
  });
});

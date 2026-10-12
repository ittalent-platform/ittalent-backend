import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { UserInvitationsService } from '../../../src/modules/user-invitations/user-invitations.service.js';
import type { UserInvitationsRepository } from '../../../src/modules/user-invitations/user-invitations.repository.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import type { UserAuditsService } from '../../../src/modules/user-audits/user-audits.service.js';
import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import type { EnterprisesService } from '../../../src/modules/enterprises/enterprises.service.js';
import type { EnterpriseRegistrationsService } from '../../../src/modules/enterprise-registrations/enterprise-registrations.service.js';

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
    expect(users.createManagedUser).not.toHaveBeenCalled();
    expect(auth.createPasswordlessLocalAccount).not.toHaveBeenCalled();
  });
});

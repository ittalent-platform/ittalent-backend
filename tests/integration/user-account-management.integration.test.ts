import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
import { Account } from '../../src/models/account.model.js';
import { Enterprise } from '../../src/models/enterprise.model.js';
import { UserAudit } from '../../src/models/user-audit.model.js';
import { UserInvitation } from '../../src/models/user-invitation.model.js';
import { UserEmailChange } from '../../src/models/user-email-change.model.js';
import { User } from '../../src/models/user.model.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';
import * as emailService from '../../src/shared/services/email.service.js';
import { userEmailChangesService } from '../../src/modules/user-email-changes/user-email-changes.service.js';
import { userInvitationsService } from '../../src/modules/user-invitations/user-invitations.service.js';
import { authRepository } from '../../src/modules/auth/auth.repository.js';
import { resetRateLimitMemory } from '../../src/middleware/rate-limit.middleware.js';
import { env } from '../../src/config/env.js';

describe('System administrator account management full flows', () => {
  let server: Server;
  let baseUrl: string;
  let adminId: Types.ObjectId;
  let enterpriseId: Types.ObjectId;
  let invitationUrl = '';
  let emailChangeUrl = '';
  const createdUserIds: Types.ObjectId[] = [];

  const token = (id: Types.ObjectId, role: string): string => jwt.sign(
    { sub: String(id), email: `${id}@example.test`, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );

  const request = async (path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, init);
    return { status: response.status, body: response.status === HTTP_STATUS.HTTP_204_NO_CONTENT ? {} : await response.json() as Record<string, unknown> };
  };

  const adminRequest = (method: string, path: string, body?: unknown) => request(path, {
    method,
    headers: { authorization: `Bearer ${token(adminId, 'admin')}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  beforeAll(async () => {
    await connectDatabase();
    adminId = new Types.ObjectId();
    const adminEmail = `admin-${adminId}@example.test`;
    await User.create({ _id: adminId, email: adminEmail, username: `admin_${adminId}`, role: 'admin', status: 'active', email_verified: true });
    enterpriseId = (await Enterprise.create({
      name: `Account test ${enterpriseId ?? new Types.ObjectId()}`,
      tax_code: `T-${new Types.ObjectId()}`,
      email: `enterprise-${new Types.ObjectId()}@example.test`,
      phone: '+84900000000',
      industry: 'IT',
      company_size: '1-10',
      address: { street: '1 Test St', city: 'Hanoi', country: 'Vietnam' },
      status: 'active',
      creator_account_id: adminId,
      is_deleted: false,
    }))._id;
    vi.spyOn(emailService, 'sendUserInvitationEmail').mockImplementation(async (_email, url) => {
      invitationUrl = url;
      return true;
    });
    vi.spyOn(emailService, 'sendUserEmailChangeEmail').mockImplementation(async (_email, url) => {
      emailChangeUrl = url;
      return true;
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await UserInvitation.deleteMany({ target_user_id: { $in: createdUserIds } });
    await UserEmailChange.deleteMany({ target_user_id: { $in: createdUserIds } });
    // Test cleanup bypasses the model's append-only hooks.
    await UserAudit.collection.deleteMany({ target_user_id: { $in: createdUserIds } });
    await Account.deleteMany({ user_id: { $in: createdUserIds } });
    await User.deleteMany({ _id: { $in: createdUserIds } });
    await User.deleteOne({ _id: adminId });
    await Enterprise.deleteOne({ _id: enterpriseId });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('creates an HR account, accepts a single-use invitation, sets its own password and authenticates', async () => {
    const username = `hr_${new Types.ObjectId().toHexString()}`;
    const result = await adminRequest('POST', '/users', {
      email: `${username}@example.test`, username, fullName: 'HR Test', role: 'recruiter', enterpriseId: String(enterpriseId),
    });
    expect(result.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    expect(result.body).toMatchObject({ user: { role: 'recruiter', status: 'invited', emailVerified: false }, invitation: { deliveryStatus: 'sent' } });
    const user = result.body.user as { id: string };
    const userId = new Types.ObjectId(user.id);
    createdUserIds.push(userId);
    expect(invitationUrl).toContain('token=');
    const invitationToken = new URL(invitationUrl).searchParams.get('token') ?? '';
    const invitation = await UserInvitation.findOne({ target_user_id: userId }).select('+token_hash').lean();
    expect(invitation?.token_hash).not.toBe(invitationToken);

    const reset = await request('/auth/forgot-password', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${username}@example.test` }),
    });
    expect(reset.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(await UserInvitation.countDocuments({ target_user_id: userId })).toBe(1);

    const accepted = await request('/user-invitations/accept', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: invitationToken, password: 'StrongPassword123!' }),
    });
    expect(accepted.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(accepted.body).toMatchObject({ id: user.id, role: 'recruiter', status: 'active' });
    expect(await Account.findOne({ user_id: userId, provider: 'local' }).select('+password_hash')).toMatchObject({ password_hash: expect.any(String) });
    expect(await UserAudit.countDocuments({ target_user_id: userId })).toBe(2);

    const login = await request('/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: username, password: 'StrongPassword123!' }),
    });
    expect(login.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const replay = await request('/user-invitations/accept', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: invitationToken, password: 'AnotherStrong123!' }),
    });
    expect(replay.status).toBe(HTTP_STATUS.HTTP_410_GONE);
  });

  it('returns gone for the removed Candidate-to-HR invitation route and preserves the Candidate account', async () => {
    const userId = new Types.ObjectId();
    createdUserIds.push(userId);
    const username = `candidate_${userId.toHexString()}`;
    const passwordHash = await bcrypt.hash('OriginalPassword123!', 4);
    await User.create({ _id: userId, email: `${username}@example.test`, username, role: 'user', status: 'active', email_verified: true });
    await Account.create({ user_id: userId, provider: 'local', password_hash: passwordHash });

    const response = await request('/user-invitations/accept-existing', {
      method: 'POST', headers: { authorization: `Bearer ${token(userId, 'user')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'a'.repeat(64) }),
    });
    expect(response.status).toBe(HTTP_STATUS.HTTP_410_GONE);
    expect(await User.findById(userId)).toMatchObject({ role: 'user', status: 'active', enterprise_id: null });
    expect((await Account.findOne({ user_id: userId, provider: 'local' }).select('+password_hash'))?.password_hash).toBe(passwordHash);
    expect(await UserInvitation.countDocuments({ target_user_id: userId })).toBe(0);
  });

  it('creates, resends and accepts an Enterprise Administrator invitation with own-company scope', async () => {
    const username = `ent_${new Types.ObjectId()}`;
    const created = await adminRequest('POST', '/users', {
      email: `${username}@example.test`, username, fullName: 'Enterprise Admin',
      role: 'enterprise_admin', enterpriseId: String(enterpriseId),
    });
    expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const id = new Types.ObjectId(String((created.body.user as { id: string }).id));
    createdUserIds.push(id);
    expect(created.body.user).toMatchObject({ role: 'enterprise_admin', status: 'invited', enterpriseId: String(enterpriseId), emailVerified: false });
    const firstToken = new URL(invitationUrl).searchParams.get('token');
    expect((await adminRequest('POST', `/users/${id}/invitation-deliveries`)).status).toBe(HTTP_STATUS.HTTP_202_ACCEPTED);
    const freshToken = new URL(invitationUrl).searchParams.get('token');
    expect(freshToken).not.toBe(firstToken);
    const accept = (tokenValue: string | null) => request('/user-invitations/accept', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenValue, password: 'EntAdminPassword123!' }),
    });
    expect((await accept(firstToken)).status).toBe(HTTP_STATUS.HTTP_410_GONE);
    expect((await accept(freshToken)).body).toMatchObject({ id: String(id), role: 'enterprise_admin', status: 'active' });
    expect((await accept(freshToken)).status).toBe(HTTP_STATUS.HTTP_410_GONE);
    expect(await User.findById(id)).toMatchObject({ role: 'enterprise_admin', enterprise_id: enterpriseId, email_verified: true });
    const login = await request('/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: username, password: 'EntAdminPassword123!' }),
    });
    expect(login.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const access = (login.body.tokens as { accessToken: string }).accessToken;
    const ownJobs = await request('/recruiter/job-postings', { headers: { authorization: `Bearer ${access}` } });
    expect(ownJobs.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await request('/users', { headers: { authorization: `Bearer ${access}` } })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    const foreign = new Types.ObjectId();
    const tampered = await request(`/recruiter/job-postings?enterprise_id=${foreign}`, { headers: { authorization: `Bearer ${access}` } });
    expect(tampered.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(tampered.body.items).toEqual(ownJobs.body.items);
    await User.updateOne({ _id: id }, { $set: { status: 'suspended' }, $inc: { auth_version: 1 } });
    for (const path of [`/job-postings/${foreign}/history`, `/job-postings/${foreign}/close`]) {
      expect((await request(path, { method: path.endsWith('/close') ? 'PATCH' : 'GET', headers: { authorization: `Bearer ${access}` } })).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    }
  });

  it('previews, cancels, reissues and accepts an invitation without reusing the old token', async () => {
    const username = `flow_${new Types.ObjectId().toHexString()}`;
    const created = await adminRequest('POST', '/users', {
      email: `${username}@example.test`, username, fullName: 'Invitation Flow', role: 'user',
    });
    expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const id = new Types.ObjectId(String((created.body.user as { id: string }).id));
    createdUserIds.push(id);
    const oldToken = new URL(invitationUrl).searchParams.get('token') ?? '';
    expect((await request(`/user-invitations/preview?token=${oldToken}`)).body).toMatchObject({ email: `${username}@example.test`, role: 'user', enterpriseName: null });
    expect((await adminRequest('PATCH', `/users/${id}/invitation`, { reason: 'Invitation sent to the wrong inbox', expectedVersion: 0 })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((await request(`/user-invitations/preview?token=${oldToken}`)).status).toBe(HTTP_STATUS.HTTP_410_GONE);
    expect((await adminRequest('GET', `/users/${id}/invitation`)).body).toMatchObject({ status: 'cancelled' });

    expect((await adminRequest('POST', `/users/${id}/invitation-deliveries`)).status).toBe(HTTP_STATUS.HTTP_202_ACCEPTED);
    const newToken = new URL(invitationUrl).searchParams.get('token') ?? '';
    expect(newToken).not.toBe(oldToken);
    expect((await request('/user-invitations/accept', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: oldToken, password: 'InviteFlow123!' }),
    })).status).toBe(HTTP_STATUS.HTTP_410_GONE);
    expect((await request('/user-invitations/accept', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: newToken, password: 'InviteFlow123!' }),
    })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(await User.findById(id)).toMatchObject({ status: 'active', role: 'user', email_verified: true });
  });

  it('changes an active company account from HR to Enterprise Administrator and revokes its old session', async () => {
    const username = `role_${new Types.ObjectId().toHexString()}`;
    const created = await adminRequest('POST', '/users', {
      email: `${username}@example.test`, username, fullName: 'Role Transition', role: 'recruiter', enterpriseId: String(enterpriseId),
    });
    expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const id = new Types.ObjectId(String((created.body.user as { id: string }).id));
    createdUserIds.push(id);
    const inviteToken = new URL(invitationUrl).searchParams.get('token') ?? '';
    expect((await request('/user-invitations/accept', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: inviteToken, password: 'RoleChange123!' }),
    })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    const login = await request('/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: username, password: 'RoleChange123!' }),
    });
    const oldToken = (login.body.tokens as { accessToken: string }).accessToken;
    const result = await adminRequest('PATCH', `/users/${id}/role`, {
      role: 'enterprise_admin', reason: 'Assigned company admin duties', expectedVersion: 1,
    });
    expect(result.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(result.body).toMatchObject({ role: 'enterprise_admin', enterpriseId: String(enterpriseId), version: 2 });
    expect((await request('/auth/me', { headers: { authorization: `Bearer ${oldToken}` } })).status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);
    expect(await UserAudit.findOne({ target_user_id: id, action: 'role_changed' })).toMatchObject({ reason: 'Assigned company admin duties', changes: { previousRole: 'recruiter', role: 'enterprise_admin' } });
  });

  it('serializes concurrent suspension of company admins and permits an audited emergency suspension of the last one', async () => {
    const company = await Enterprise.create({
      name: `Last admin test ${new Types.ObjectId()}`,
      tax_code: `T-${new Types.ObjectId()}`,
      email: `last-admin-${new Types.ObjectId()}@example.test`,
      phone: '+84900000000',
      industry: 'IT',
      company_size: '1-10',
      address: { street: '1 Test St', city: 'Hanoi', country: 'Vietnam' },
      status: 'active',
      creator_account_id: adminId,
      is_deleted: false,
    });
    const ids: Types.ObjectId[] = [];
    for (const suffix of ['one', 'two']) {
      const username = `la${suffix === 'one' ? '1' : '2'}_${new Types.ObjectId().toHexString()}`;
      const created = await adminRequest('POST', '/users', {
        email: `${username}@example.test`, username, fullName: `Admin ${suffix}`, role: 'enterprise_admin', enterpriseId: String(company._id),
      });
      expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
      const id = new Types.ObjectId(String((created.body.user as { id: string }).id));
      ids.push(id);
      createdUserIds.push(id);
      const inviteToken = new URL(invitationUrl).searchParams.get('token') ?? '';
      expect((await request('/user-invitations/accept', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, password: 'LastAdmin123!' }),
      })).status).toBe(HTTP_STATUS.HTTP_200_OK);
    }
    const suspend = (id: Types.ObjectId) => adminRequest('PATCH', `/users/${id}/status`, {
      status: 'suspended', reason: 'Company access ended', expectedVersion: 1,
    });
    const results = await Promise.all(ids.map(suspend));
    expect(results.map((result) => result.status).sort()).toEqual([HTTP_STATUS.HTTP_200_OK, HTTP_STATUS.HTTP_409_CONFLICT].sort());
    const survivor = await User.findOne({ enterprise_id: company._id, role: 'enterprise_admin', status: 'active' });
    expect(survivor).not.toBeNull();
    const urgent = await adminRequest('PATCH', `/users/${survivor?._id}/emergency-suspension`, {
      reason: 'Suspected account compromise', expectedVersion: survivor?.version,
    });
    expect(urgent.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(await User.countDocuments({ enterprise_id: company._id, role: 'enterprise_admin', status: 'active' })).toBe(0);
    if (!survivor) throw new Error('Expected one active Enterprise Administrator to remain');
    expect(await UserAudit.findOne({ target_user_id: survivor._id, action: 'status_suspended' })).toMatchObject({ reason: 'Suspected account compromise', changes: { emergency: 'true' } });
    await Enterprise.deleteOne({ _id: company._id });
  });

  it('requires an active non-deleted enterprise and System Administrator to create an Ent Admin', async () => {
    const body = { email: `${new Types.ObjectId()}@example.test`, username: `bad_${new Types.ObjectId()}`, fullName: 'Ent Admin', role: 'enterprise_admin' };
    expect((await adminRequest('POST', '/users', body)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
    expect((await adminRequest('POST', '/users', { ...body, enterpriseId: String(new Types.ObjectId()) })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    await Enterprise.updateOne({ _id: enterpriseId }, { $set: { status: 'suspended' } });
    try {
      expect((await adminRequest('POST', '/users', { ...body, enterpriseId: String(enterpriseId) })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      await Enterprise.updateOne({ _id: enterpriseId }, { $set: { status: 'active', is_deleted: true } });
      expect((await adminRequest('POST', '/users', { ...body, enterpriseId: String(enterpriseId) })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
    } finally {
      await Enterprise.updateOne({ _id: enterpriseId }, { $set: { status: 'active', is_deleted: false } });
    }
    expect(await User.exists({ email: body.email })).toBeNull();
    const candidate = await User.create({ email: `${new Types.ObjectId()}@example.test`, username: `not_admin_${new Types.ObjectId()}`, role: 'user', status: 'active', email_verified: true });
    createdUserIds.push(candidate._id);
    expect((await request('/users', {
      method: 'POST', headers: { authorization: `Bearer ${token(candidate._id, 'user')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, enterpriseId: String(enterpriseId) }),
    })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
  });

  it('keeps Ent Admin invited when its enterprise becomes suspended before acceptance', async () => {
    const username = `sus_${new Types.ObjectId()}`;
    const created = await adminRequest('POST', '/users', { email: `${username}@example.test`, username, fullName: 'Ent Admin', role: 'enterprise_admin', enterpriseId: String(enterpriseId) });
    expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const id = new Types.ObjectId(String((created.body.user as { id: string }).id));
    createdUserIds.push(id);
    const raw = new URL(invitationUrl).searchParams.get('token');
    await Enterprise.updateOne({ _id: enterpriseId }, { $set: { status: 'suspended' } });
    try {
      const result = await request('/user-invitations/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: raw, password: 'EntAdminPassword123!' }) });
      expect(result.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
      expect((await adminRequest('POST', `/users/${id}/invitation-deliveries`)).status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
      expect(await User.findById(id)).toMatchObject({ status: 'invited', email_verified: false });
      expect(await UserInvitation.findOne({ target_user_id: id })).toMatchObject({ status: 'pending' });
      expect((await Account.findOne({ user_id: id }).select('+password_hash'))?.password_hash).toBeUndefined();
    } finally {
      await Enterprise.updateOne({ _id: enterpriseId }, { $set: { status: 'active' } });
    }
  });

  it('rejects an expired Ent Admin invitation without activating the account', async () => {
    const username = `exp_${new Types.ObjectId()}`;
    const created = await adminRequest('POST', '/users', { email: `${username}@example.test`, username, fullName: 'Expired Ent Admin', role: 'enterprise_admin', enterpriseId: String(enterpriseId) });
    expect(created.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const id = new Types.ObjectId(String((created.body.user as { id: string }).id));
    createdUserIds.push(id);
    const raw = new URL(invitationUrl).searchParams.get('token');
    await UserInvitation.updateOne({ target_user_id: id }, { $set: { expires_at: new Date(Date.now() - 1) } });
    expect((await request('/user-invitations/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: raw, password: 'EntAdminPassword123!' }) })).status).toBe(HTTP_STATUS.HTTP_410_GONE);
    expect(await User.findById(id)).toMatchObject({ status: 'invited', email_verified: false });
  });

  it('audits a versioned suspension, rejects stale updates, and returns its history', async () => {
    const userId = new Types.ObjectId();
    createdUserIds.push(userId);
    await User.create({ _id: userId, email: `${userId}@example.test`, username: `status_${userId}`, role: 'user', status: 'active', email_verified: true });
    const suspended = await adminRequest('PATCH', `/users/${userId}/status`, { status: 'suspended', reason: 'Policy review', expectedVersion: 0 });
    expect(suspended.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(suspended.body).toMatchObject({ status: 'suspended', version: 1 });
    const stale = await adminRequest('PATCH', `/users/${userId}/status`, { status: 'active', reason: 'Stale reopen', expectedVersion: 0 });
    expect(stale.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    const history = await adminRequest('GET', `/users/${userId}/history`);
    expect(history.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(history.body).toMatchObject({ total: 1, items: [expect.objectContaining({ action: 'status_suspended', actorName: expect.any(String), reason: 'Policy review', version: 1 })] });
    expect(await User.findById(userId)).toMatchObject({ auth_version: 1, status: 'suspended' });
  });

  it('requires the account owner to confirm an email change with the current password and invalidates old sessions', async () => {
    const userId = new Types.ObjectId();
    createdUserIds.push(userId);
    const username = `emailchange_${userId.toHexString()}`;
    const oldEmail = `${username}@example.test`;
    const newEmail = `${username}@new.example.test`;
    const password = 'CurrentPassword123!';
    await User.create({ _id: userId, email: oldEmail, username, role: 'user', status: 'active', email_verified: true });
    await Account.create({ user_id: userId, provider: 'local', password_hash: await bcrypt.hash(password, 4) });
    const oldAccessToken = token(userId, 'user');

    const requested = await adminRequest('POST', `/users/${userId}/email-change-requests`, { newEmail, expectedVersion: 0 });
    expect(requested.status).toBe(HTTP_STATUS.HTTP_202_ACCEPTED);
    expect(requested.body).toMatchObject({ deliveryStatus: 'sent' });
    expect(await User.findById(userId)).toMatchObject({ email: oldEmail, version: 0 });
    const rawToken = new URL(emailChangeUrl).searchParams.get('token') ?? '';

    const rejected = await request('/user-email-changes/confirm', {
      method: 'POST', headers: { authorization: `Bearer ${oldAccessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken, currentPassword: 'IncorrectPassword123!' }),
    });
    expect(rejected.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect(await User.findById(userId)).toMatchObject({ email: oldEmail });

    const confirmed = await request('/user-email-changes/confirm', {
      method: 'POST', headers: { authorization: `Bearer ${oldAccessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken, currentPassword: password }),
    });
    expect(confirmed.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(confirmed.body).toMatchObject({ email: newEmail, authVersion: 1 });
    expect(await User.findById(userId)).toMatchObject({ email: newEmail, email_verified: true, auth_version: 1, version: 1 });
    expect(await request('/auth/me', { headers: { authorization: `Bearer ${oldAccessToken}` } })).toMatchObject({ status: HTTP_STATUS.HTTP_401_UNAUTHORIZED });

    const login = await request('/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: newEmail, password }),
    });
    expect(login.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const history = await adminRequest('GET', `/users/${userId}/history`);
    expect(history.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(JSON.stringify(history.body)).not.toContain(oldEmail);
    expect(JSON.stringify(history.body)).not.toContain(newEmail);
  });

  it('serializes concurrent attempts to suspend the final active System Administrator', async () => {
    const secondAdminId = new Types.ObjectId();
    createdUserIds.push(secondAdminId);
    await User.create({ _id: secondAdminId, email: `${secondAdminId}@example.test`, username: `admin_${secondAdminId}`, role: 'admin', status: 'active', email_verified: true });
    const headers = (id: Types.ObjectId) => ({ authorization: `Bearer ${token(id, 'admin')}`, 'content-type': 'application/json' });
    const [first, second] = await Promise.all([
      request(`/users/${secondAdminId}/status`, { method: 'PATCH', headers: headers(adminId), body: JSON.stringify({ status: 'suspended', reason: 'Concurrent lockout check', expectedVersion: 0 }) }),
      request(`/users/${adminId}/status`, { method: 'PATCH', headers: headers(secondAdminId), body: JSON.stringify({ status: 'suspended', reason: 'Concurrent lockout check', expectedVersion: 0 }) }),
    ]);
    expect([first.status, second.status].sort()).toEqual(expect.arrayContaining([HTTP_STATUS.HTTP_200_OK]));
    expect([first.status, second.status].every((status) => status === HTTP_STATUS.HTTP_200_OK || status === HTTP_STATUS.HTTP_403_FORBIDDEN || status === HTTP_STATUS.HTTP_409_CONFLICT)).toBe(true);
    expect(await User.countDocuments({ role: 'admin', status: 'active' })).toBe(1);
    await User.updateOne({ _id: adminId }, { $set: { status: 'active', auth_version: 0, version: 0 } });
  });

  it('rejects self-suspension with an uppercase target ObjectId', async () => {
    const result = await adminRequest('PATCH', `/users/${String(adminId).toUpperCase()}/status`, {
      status: 'suspended', reason: 'Uppercase ID', expectedVersion: 0,
    });
    expect(result.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
    expect(await User.findById(adminId)).toMatchObject({ status: 'active' });
  });

  it('does not grant optional private company reads to a suspended or revoked admin token', async () => {
    const reader = await User.create({ email: `${new Types.ObjectId()}@example.test`, username: `reader_${new Types.ObjectId()}`, role: 'admin', status: 'active', email_verified: true });
    createdUserIds.push(reader._id);
    const stale = token(reader._id, 'admin');
    await Enterprise.updateOne({ _id: enterpriseId }, { $set: { status: 'pending' } });
    try {
      expect((await request(`/enterprises/${enterpriseId}`, { headers: { authorization: `Bearer ${stale}` } })).status).toBe(HTTP_STATUS.HTTP_200_OK);
      await User.updateOne({ _id: reader._id }, { $inc: { auth_version: 1 } });
      expect((await request(`/enterprises/${enterpriseId}`, { headers: { authorization: `Bearer ${stale}` } })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      await User.updateOne({ _id: reader._id }, { $set: { auth_version: 0, status: 'suspended' } });
      expect((await request(`/enterprises/${enterpriseId}`, { headers: { authorization: `Bearer ${stale}` } })).status).toBe(HTTP_STATUS.HTTP_404_NOT_FOUND);
      const publicList = await request('/enterprises?status=pending', { headers: { authorization: `Bearer ${stale}` } });
      expect(publicList.status).toBe(HTTP_STATUS.HTTP_200_OK);
      expect(publicList.body.items).toEqual([]);
    } finally {
      await Enterprise.updateOne({ _id: enterpriseId }, { $set: { status: 'active' } });
    }
  });

  it('returns the company users when sorting by name, with matching row count', async () => {
    const user = await User.create({ email: `${new Types.ObjectId()}@example.test`, username: `sorted_${new Types.ObjectId()}`, full_name: 'Name sorted HR', role: 'recruiter', status: 'active', email_verified: true, enterprise_id: enterpriseId });
    createdUserIds.push(user._id);
    const result = await adminRequest('GET', `/users?enterpriseId=${enterpriseId}&sortBy=name&limit=100`);
    expect(result.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const items = result.body.items as { id: string }[];
    expect(items.some((item) => item.id === String(user._id))).toBe(true);
    expect(items).toHaveLength(result.body.total as number);
  });

  it('keeps only the latest pending email request after concurrent first requests', async () => {
    const user = await User.create({ email: `${new Types.ObjectId()}@example.test`, username: `email_race_${new Types.ObjectId()}`, role: 'user', status: 'active', email_verified: true });
    createdUserIds.push(user._id);
    await Promise.all(Array.from({ length: 4 }, (_, i) => userEmailChangesService.request(
      String(adminId), String(user._id), `${user._id}-${i}@new.example.test`, 0,
    )));
    expect(await UserEmailChange.countDocuments({ target_user_id: user._id, status: 'pending' })).toBe(1);
    expect(await UserEmailChange.countDocuments({ target_user_id: user._id, status: 'revoked' })).toBe(3);
    expect(await User.findById(user._id)).toMatchObject({ version: 0, auth_version: 0 });
  });

  it('does not allow an existing Candidate account to accept the removed membership-invitation flow', async () => {
    const candidate = await User.create({ email: `${new Types.ObjectId()}@example.test`, username: `invite_race_${new Types.ObjectId()}`, role: 'user', status: 'active', email_verified: true });
    createdUserIds.push(candidate._id);
    const legacyAccept = await request('/user-invitations/accept-existing', {
      method: 'POST', headers: { authorization: `Bearer ${token(candidate._id, 'user')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'a'.repeat(64) }),
    });
    expect(legacyAccept.status).toBe(HTTP_STATUS.HTTP_410_GONE);
    expect(await User.findById(candidate._id)).toMatchObject({ role: 'user', status: 'active', enterprise_id: null });
    const invited = await userInvitationsService.createAccount(String(adminId), {
      email: `${new Types.ObjectId()}@example.test`, username: `resend_${new Types.ObjectId()}`, fullName: 'Concurrent resend', role: 'user',
    });
    const id = new Types.ObjectId(String(invited.user.id));
    createdUserIds.push(id);
    await Promise.all(Array.from({ length: 4 }, () => userInvitationsService.resendInvitation(String(adminId), String(id))));
    expect(await UserInvitation.countDocuments({ target_user_id: id, status: 'pending' })).toBe(1);
    expect(await UserInvitation.countDocuments({ target_user_id: id, status: 'revoked' })).toBe(4);
  });

  it('limits failed email-change password checks before further bcrypt work', async () => {
    resetRateLimitMemory();
    const user = await User.create({ email: `${new Types.ObjectId()}@example.test`, username: `limited_${new Types.ObjectId()}`, role: 'user', status: 'active', email_verified: true });
    createdUserIds.push(user._id);
    await Account.create({ user_id: user._id, provider: 'local', password_hash: await bcrypt.hash('CurrentPassword123!', 4) });
    await userEmailChangesService.request(String(adminId), String(user._id), `${user._id}@new.example.test`, 0);
    const rawToken = new URL(emailChangeUrl).searchParams.get('token');
    const passwordChecks = vi.spyOn(authRepository, 'verifyCurrentPassword');
    try {
      for (let i = 0; i < env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
        expect((await request('/user-email-changes/confirm', {
          method: 'POST', headers: { authorization: `Bearer ${token(user._id, 'user')}`, 'content-type': 'application/json' },
          body: JSON.stringify({ token: rawToken, currentPassword: 'WrongPassword123!' }),
        })).status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);
      }
      expect((await request('/user-email-changes/confirm', {
        method: 'POST', headers: { authorization: `Bearer ${token(user._id, 'user')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ token: rawToken, currentPassword: 'WrongPassword123!' }),
      })).status).toBe(HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS);
      expect(passwordChecks).toHaveBeenCalledTimes(env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
    } finally {
      passwordChecks.mockRestore();
      resetRateLimitMemory();
    }
  });

  const createCandidate = async (extra: Record<string, unknown> = {}) => {
    const id = new Types.ObjectId();
    createdUserIds.push(id);
    await User.create({ _id: id, email: `${id}@example.test`, username: `cand_${id}`, role: 'user', status: 'active', email_verified: true, full_name: 'Candidate One', ...extra });
    return id;
  };

  it('treats a profile PATCH with unchanged values or an empty body as a no-op without audit, but still enforces the version', async () => {
    const id = await createCandidate();
    const unchanged = await adminRequest('PATCH', `/users/${id}`, { fullName: 'Candidate One', expectedVersion: 0 });
    expect(unchanged.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(unchanged.body).toMatchObject({ version: 0 });
    const empty = await adminRequest('PATCH', `/users/${id}`, { expectedVersion: 0 });
    expect(empty.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(await UserAudit.countDocuments({ target_user_id: id })).toBe(0);
    expect((await adminRequest('PATCH', `/users/${id}`, { expectedVersion: 7 })).status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);

    const changed = await adminRequest('PATCH', `/users/${id}`, { fullName: 'Candidate Two', phone: '0912345678', expectedVersion: 0 });
    expect(changed.body).toMatchObject({ fullName: 'Candidate Two', version: 1 });
    const audit = await UserAudit.findOne({ target_user_id: id, action: 'profile_updated' }).lean();
    expect(JSON.stringify(audit?.changes)).not.toContain('Candidate Two');
    expect(JSON.stringify(audit?.changes)).not.toContain('0912345678');
  });

  it('reopening an unverified suspended account lands on inactive and restarts the verification window', async () => {
    const id = await createCandidate({ status: 'suspended', email_verified: false });
    await User.collection.updateOne({ _id: id }, { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } });
    const reopened = await adminRequest('PATCH', `/users/${id}/status`, { status: 'active', reason: 'Verified by phone call', expectedVersion: 0 });
    expect(reopened.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect(reopened.body).toMatchObject({ status: 'inactive', emailVerified: false });
    const stored = await User.findById(id).lean();
    expect(stored?.verification_started_at).toBeInstanceOf(Date);
    const { usersService } = await import('../../src/modules/users/users.service.js');
    await usersService.blockExpiredInactiveUsers(new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect((await User.findById(id).lean())?.status).toBe('inactive');
  });

  it('requires a reason of at least 10 characters for status changes', async () => {
    const id = await createCandidate();
    const short = await adminRequest('PATCH', `/users/${id}/status`, { status: 'suspended', reason: 'too short', expectedVersion: 0 });
    expect(short.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('filters the list by several roles/statuses and the history by group, actor and date range', async () => {
    const a = await createCandidate({ status: 'suspended' });
    const b = await createCandidate();
    const list = await adminRequest('GET', `/users?status=suspended,inactive&role=user&search=${String(a)}&limit=5`);
    expect(list.status).toBe(HTTP_STATUS.HTTP_200_OK);
    expect((list.body.items as { id: string }[]).map((item) => item.id)).toEqual([String(a)]);
    expect((await adminRequest('GET', '/users?role=bogus')).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);

    await adminRequest('PATCH', `/users/${b}`, { fullName: 'Renamed Person', expectedVersion: 0 });
    const profile = await adminRequest('GET', `/users/${b}/history?group=profile&actor=admin`);
    expect((profile.body.items as unknown[]).length).toBe(1);
    expect(((await adminRequest('GET', `/users/${b}/history?group=email`)).body.items as unknown[]).length).toBe(0);
    expect(((await adminRequest('GET', `/users/${b}/history?actor=self`)).body.items as unknown[]).length).toBe(0);
    expect((await adminRequest('GET', `/users/${b}/history?from=2026-02-01&to=2026-01-01`)).status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
  });

  it('refuses to modify or delete audit events through the model', async () => {
    const id = await createCandidate();
    await adminRequest('PATCH', `/users/${id}`, { fullName: 'Another Name', expectedVersion: 0 });
    await expect(UserAudit.updateMany({ target_user_id: id }, { $set: { reason: 'x' } })).rejects.toThrow('append-only');
    await expect(UserAudit.deleteMany({ target_user_id: id })).rejects.toThrow('append-only');
  });

  it('reports a stale version and an illegal transition with machine-readable codes', async () => {
    const id = await createCandidate();
    const stale = await adminRequest('PATCH', `/users/${id}/status`, { status: 'suspended', reason: 'Version is stale here', expectedVersion: 9 });
    expect(stale.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT' });
    const already = await adminRequest('PATCH', `/users/${id}/status`, { status: 'active', reason: 'Already active account', expectedVersion: 0 });
    expect(already.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    expect(already.body).toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

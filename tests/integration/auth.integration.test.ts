import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis, getRedis } from '../../src/config/redis.js';
import { resetRateLimitMemory } from '../../src/middleware/rate-limit.middleware.js';
import { Account } from '../../src/models/account.model.js';
import { Token } from '../../src/models/token.model.js';
import { User } from '../../src/models/user.model.js';
import { authService } from '../../src/modules/auth/auth.service.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';
import * as emailService from '../../src/shared/services/email.service.js';

describe('Auth Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let lastVerificationUrl = '';
  let lastResetPasswordUrl = '';

  beforeAll(async () => {
    await connectDatabase();
    await Promise.all([Account.syncIndexes(), User.syncIndexes(), Token.syncIndexes()]);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    vi.spyOn(emailService, 'sendVerificationEmail').mockImplementation(async (_to, url) => {
      lastVerificationUrl = url;
    });

    vi.spyOn(emailService, 'sendResetPasswordEmail').mockImplementation(async (_to, url) => {
      lastResetPasswordUrl = url;
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await disconnectRedis();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    resetRateLimitMemory();
    const redis = await getRedis();
    if (redis?.isOpen) {
      await redis.flushDb();
    }
    await User.deleteMany({});
    await Account.deleteMany({});
    await Token.deleteMany({});
    lastVerificationUrl = '';
    lastResetPasswordUrl = '';
  });

  it('handles registration, unverified login grace period, expired inactive rejection, email verification, replay protection, and profile retrieval', async () => {
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'john@example.com',
        username: 'johndoe',
        password: 'Password123!',
      }),
    });
    expect(registerRes.status).toBe(HTTP_STATUS.HTTP_201_CREATED);
    const registerBody = (await registerRes.json()) as { user: { status: string } };
    expect(registerBody.user.status).toBe('inactive');

    const dbUser = await User.findOne({ email: 'john@example.com' });
    expect(dbUser).toBeDefined();
    expect(dbUser?.status).toBe('inactive');
    expect(dbUser?.enterprise_id).toBeNull();

    const dbToken = await Token.findOne({ user_id: dbUser!._id, type: 'email_verification' }).lean();
    expect(dbToken?.status).toBe('pending');

    // Unverified inactive user within 24h window can log in normally
    const loginGraceRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'john@example.com',
        password: 'Password123!',
      }),
    });
    expect(loginGraceRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const graceLoginBody = (await loginGraceRes.json()) as { tokens: { accessToken: string }; user: { status: string } };
    expect(graceLoginBody.tokens.accessToken).toBeDefined();
    expect(graceLoginBody.user.status).toBe('inactive');

    // Inactive user whose verification window expired (> 24 hours) is rejected
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await User.collection.updateOne({ _id: dbUser!._id }, { $set: { createdAt: twentyFiveHoursAgo } });

    const loginExpiredRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'john@example.com',
        password: 'Password123!',
      }),
    });
    expect(loginExpiredRes.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);

    // Reset createdAt so email verification flow can proceed
    await User.collection.updateOne({ _id: dbUser!._id }, { $set: { createdAt: new Date() } });

    expect(lastVerificationUrl).toContain('token=');
    const verifyToken = new URL(lastVerificationUrl).searchParams.get('token') ?? '';
    expect(verifyToken.length).toBeGreaterThan(0);

    const verifyRes = await fetch(`${baseUrl}/verify-email?token=${verifyToken}`, {
      redirect: 'manual',
    });
    expect(verifyRes.status).toBe(HTTP_STATUS.HTTP_302_FOUND);
    const location = verifyRes.headers.get('location') ?? '';
    expect(location).toContain('stage=success');

    const verifiedUser = await User.findOne({ email: 'john@example.com' });
    expect(verifiedUser?.status).toBe('active');

    const replayVerifyRes = await fetch(`${baseUrl}/verify-email?token=${verifyToken}`, {
      redirect: 'manual',
    });
    expect(replayVerifyRes.status).toBe(HTTP_STATUS.HTTP_302_FOUND);
    const replayLocation = replayVerifyRes.headers.get('location') ?? '';
    expect(replayLocation).toContain('stage=already-verified');

    const loginActiveRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'john@example.com',
        password: 'Password123!',
      }),
    });
    expect(loginActiveRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const loginBody = (await loginActiveRes.json()) as { tokens: { accessToken: string }; user: { status: string } };
    expect(loginBody.tokens.accessToken).toBeDefined();
    expect(loginBody.user.status).toBe('active');

    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${loginBody.tokens.accessToken}` },
    });
    expect(meRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const meBody = (await meRes.json()) as { email: string };
    expect(meBody.email).toBe('john@example.com');
  });

  it('handles password reset lifecycle, preflight checks, single-use invalidation, and password rotation', async () => {
    await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        username: 'alice',
        password: 'OldPassword123!',
      }),
    });
    await User.updateOne({ email: 'alice@example.com' }, { status: 'active' });

    const forgotRes = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com' }),
    });
    expect(forgotRes.status).toBe(HTTP_STATUS.HTTP_200_OK);

    expect(lastResetPasswordUrl).toContain('token=');
    const resetToken = new URL(lastResetPasswordUrl).searchParams.get('token') ?? '';
    expect(resetToken.length).toBeGreaterThan(0);

    const checkTokenRes = await fetch(`${baseUrl}/api/v1/auth/reset-password?token=${resetToken}`);
    expect(checkTokenRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const checkTokenBody = (await checkTokenRes.json()) as { data: { valid: boolean } };
    expect(checkTokenBody.data.valid).toBe(true);

    const resetRes = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        newPassword: 'NewPassword123!',
      }),
    });
    expect(resetRes.status).toBe(HTTP_STATUS.HTTP_200_OK);

    const replayCheckRes = await fetch(`${baseUrl}/api/v1/auth/reset-password?token=${resetToken}`);
    expect(replayCheckRes.status).toBe(HTTP_STATUS.HTTP_410_GONE);

    const replayResetRes = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        newPassword: 'AnotherPassword123!',
      }),
    });
    expect(replayResetRes.status).toBe(HTTP_STATUS.HTTP_410_GONE);

    const oldLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'alice@example.com',
        password: 'OldPassword123!',
      }),
    });
    expect(oldLoginRes.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);

    const newLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'alice@example.com',
        password: 'NewPassword123!',
      }),
    });
    expect(newLoginRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const newLoginBody = (await newLoginRes.json()) as { tokens: { accessToken: string } };

    const changeRes = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newLoginBody.tokens.accessToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'NewPassword123!',
        newPassword: 'RotatedPassword123!',
      }),
    });
    expect(changeRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
  });

  it('blocks expired unverified users while preserving privileged accounts', async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

    const expiredUser = await User.create({
      email: 'expired@example.com',
      username: 'expireduser',
      status: 'inactive',
      role: 'user',
    });
    await User.collection.updateOne({ _id: expiredUser._id }, { $set: { createdAt: twentyFiveHoursAgo } });

    const adminUser = await User.create({
      email: 'admin@example.com',
      username: 'adminuser',
      status: 'inactive',
      role: 'admin',
    });
    await User.collection.updateOne({ _id: adminUser._id }, { $set: { createdAt: twentyFiveHoursAgo } });

    const blockedCount = await authService.blockExpiredUnverifiedUsers();
    expect(blockedCount).toBeGreaterThanOrEqual(1);

    const reloadedUser = await User.findById(expiredUser._id);
    expect(reloadedUser?.status).toBe('blocked');

    const reloadedAdmin = await User.findById(adminUser._id);
    expect(reloadedAdmin?.status).toBe('inactive');
  });

  it('allows registering multiple local users without duplicate key error on compound index', async () => {
    const user1Res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user1@example.com',
        username: 'uniqueuser1',
        password: 'Password123!',
      }),
    });
    expect(user1Res.status).toBe(HTTP_STATUS.HTTP_201_CREATED);

    const user2Res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user2@example.com',
        username: 'uniqueuser2',
        password: 'Password123!',
      }),
    });
    expect(user2Res.status).toBe(HTTP_STATUS.HTTP_201_CREATED);

    const accounts = await Account.find({ provider: 'local' });
    expect(accounts).toHaveLength(2);
  });
});

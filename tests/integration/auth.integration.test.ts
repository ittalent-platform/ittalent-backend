import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { disconnectRedis } from '../../src/config/redis.js';
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
    await User.deleteMany({});
    await Account.deleteMany({});
    await Token.deleteMany({});
    lastVerificationUrl = '';
    lastResetPasswordUrl = '';
  });

  it('handles registration, inactive login rejection, email verification, replay protection, and profile retrieval', async () => {
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

    const dbToken = await Token.findOne({ user_id: dbUser!._id, type: 'email_verification' }).lean();
    expect(dbToken?.status).toBe('pending');

    const loginInactiveRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'john@example.com',
        password: 'Password123!',
      }),
    });
    expect(loginInactiveRes.status).toBe(HTTP_STATUS.HTTP_403_FORBIDDEN);

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
    const loginBody = (await loginActiveRes.json()) as { tokens: { accessToken: string } };
    expect(loginBody.tokens.accessToken).toBeDefined();

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
});

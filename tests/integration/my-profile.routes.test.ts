import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../../src/models/user.model.js';
import { app } from '../../src/app.js';
import { AVATAR_MAX_BYTES } from '../../src/middleware/avatar-upload.middleware.js';
import { resetRateLimitMemory } from '../../src/middleware/rate-limit.middleware.js';
import { env } from '../../src/config/env.js';
import { authRepository } from '../../src/modules/auth/auth.repository.js';
import { authService } from '../../src/modules/auth/auth.service.js';
import { AUTH_MESSAGES } from '../../src/modules/auth/auth.constants.js';
import { PROFILE_MESSAGES } from '../../src/modules/my-profile/my-profile.constants.js';
import { myProfileRepository } from '../../src/modules/my-profile/my-profile.repository.js';
import { myProfileService } from '../../src/modules/my-profile/my-profile.service.js';
import { usersService } from '../../src/modules/users/users.service.js';
import { HTTP_STATUS } from '../../src/shared/constants/http-status.js';
import { createHttpError } from '../../src/shared/errors/http-error.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';
const profile = {
  id: USER_ID, email: 'mine@example.test', username: 'mine', fullName: 'My Name', phone: null,
  avatarUrl: null, hasPassword: true, role: 'user', status: 'active', emailVerified: true, enterpriseId: null, version: 1,
};

describe('my profile routes', () => {
  let server: Server;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    token = jwt.sign({ sub: USER_ID, email: profile.email, role: 'user', av: 0 }, env.JWT_ACCESS_SECRET);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); });
    });
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    resetRateLimitMemory();
    vi.spyOn(User, 'findById').mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => ({ role: 'user', status: 'active', auth_version: 0 }) }) }) } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['GET', 'PATCH'])('rejects unauthenticated %s', async (method) => {
    const response = await fetch(`${baseUrl}/api/v1/me/profile`, { method });
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated avatar and password changes', async () => {
    const avatar = await fetch(`${baseUrl}/api/v1/me/profile/avatar`, { method: 'PATCH' });
    const password = await fetch(`${baseUrl}/api/v1/auth/change-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: 'Old123!a', newPassword: 'New123!a' }) });
    expect(avatar.status).toBe(401);
    expect(password.status).toBe(401);
  });

  it('reads only the token subject and returns a safe profile', async () => {
    vi.spyOn(myProfileService, 'get').mockResolvedValue(profile);
    const response = await fetch(`${baseUrl}/api/v1/me/profile?userId=${OTHER_ID}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(profile);
    expect(myProfileService.get).toHaveBeenCalledWith(USER_ID);
    expect(JSON.stringify(profile)).not.toContain('password_hash');
  });

  it('rejects protected field updates', async () => {
    const update = vi.spyOn(myProfileService, 'update');
    const response = await fetch(`${baseUrl}/api/v1/me/profile`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'admin', fullName: 'My Name' }) });
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the current profile with valid input', async () => {
    vi.spyOn(myProfileService, 'update').mockResolvedValue({ ...profile, fullName: 'New Name' });
    const response = await fetch(`${baseUrl}/api/v1/me/profile`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: 'New Name' }) });
    expect(response.status).toBe(200);
    expect(myProfileService.update).toHaveBeenCalledWith(USER_ID, { fullName: 'New Name' });
  });

  it('returns 409 Conflict when expectedVersion does not match current profile version', async () => {
    vi.spyOn(myProfileRepository, 'findById').mockResolvedValue({ _id: USER_ID, version: 2 } as never);
    const updateSpy = vi.spyOn(myProfileRepository, 'update');

    const response = await fetch(`${baseUrl}/api/v1/me/profile`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'New Name', expectedVersion: 1 }),
    });

    expect(response.status).toBe(HTTP_STATUS.HTTP_409_CONFLICT);
    const body = (await response.json()) as { message: string };
    expect(body.message).toBe(PROFILE_MESSAGES.VERSION_CONFLICT);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rate limits consecutive failed change-password attempts with 429 Too Many Requests', async () => {
    vi.spyOn(authService, 'changePassword').mockRejectedValue(
      createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AUTH_MESSAGES.INVALID_CURRENT_PASSWORD),
    );

    for (let i = 0; i < 5; i += 1) {
      const failedRes = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'WrongPassword1!', newPassword: 'NewPassword1!' }),
      });
      expect(failedRes.status).toBe(HTTP_STATUS.HTTP_400_BAD_REQUEST);
      const failedBody = (await failedRes.json()) as { message: string };
      expect(failedBody.message).toBe("That password isn't right.");
    }

    const rateLimitedRes = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'WrongPassword1!', newPassword: 'NewPassword1!' }),
    });
    expect(rateLimitedRes.status).toBe(HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS);
  });

  it('revokes other sessions by incrementing auth_version and returns rotated tokens on password change', async () => {
    let persistedAuthVersion = 0;
    vi.spyOn(User, 'findById').mockImplementation(() => ({
      select: () => ({
        lean: () => ({
          exec: async () => ({ role: 'user', status: 'active', auth_version: persistedAuthVersion }),
        }),
      }),
    }) as never);

    const passwordHash = await bcrypt.hash('OldPassword1!', 10);
    vi.spyOn(authRepository, 'findLocalAccountByUserId').mockResolvedValue({
      _id: 'acc-1',
      user_id: USER_ID,
      provider: 'local',
      password_hash: passwordHash,
    } as never);
    vi.spyOn(authRepository, 'updateLocalAccountPassword').mockResolvedValue(undefined);
    vi.spyOn(usersService, 'incrementAuthVersion').mockImplementation(async () => {
      persistedAuthVersion += 1;
      return {
        _id: USER_ID,
        email: profile.email,
        role: 'user',
        auth_version: persistedAuthVersion,
      } as never;
    });
    vi.spyOn(myProfileService, 'get').mockResolvedValue(profile);

    const changeRes = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'OldPassword1!',
        newPassword: 'NewPassword1!',
        revokeOtherSessions: true,
      }),
    });

    expect(changeRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
    const changeBody = (await changeRes.json()) as {
      data: { tokens?: { accessToken: string; refreshToken: string } };
    };
    expect(changeBody.data.tokens?.accessToken).toBeDefined();
    expect(changeBody.data.tokens?.refreshToken).toBeDefined();

    // Old token on other devices is rejected with 401
    const oldSessionRes = await fetch(`${baseUrl}/api/v1/me/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(oldSessionRes.status).toBe(HTTP_STATUS.HTTP_401_UNAUTHORIZED);

    // Current session using rotated token remains authenticated
    const currentSessionRes = await fetch(`${baseUrl}/api/v1/me/profile`, {
      headers: { Authorization: `Bearer ${changeBody.data.tokens!.accessToken}` },
    });
    expect(currentSessionRes.status).toBe(HTTP_STATUS.HTTP_200_OK);
  });

  it('rejects invalid avatar content and accepts valid image signature', async () => {
    const upload = vi.spyOn(myProfileService, 'replaceAvatar').mockResolvedValue({ ...profile, avatarUrl: 'https://example.test/avatar.png' });
    const invalid = new FormData();
    invalid.append('avatar', new Blob(['invalid'], { type: 'image/png' }), 'bad.png');
    const rejected = await fetch(`${baseUrl}/api/v1/me/profile/avatar`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: invalid });
    expect(rejected.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();

    const valid = new FormData();
    valid.append('avatar', new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: 'image/png' }), 'good.png');
    const accepted = await fetch(`${baseUrl}/api/v1/me/profile/avatar`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: valid });
    expect(accepted.status).toBe(200);
    expect(upload).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ originalname: 'good.png' }));
  });

  it('rejects an avatar above the configured size limit', async () => {
    const upload = vi.spyOn(myProfileService, 'replaceAvatar');
    const oversized = new FormData();
    oversized.append('avatar', new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], { type: 'image/png' }), 'large.png');
    const response = await fetch(`${baseUrl}/api/v1/me/profile/avatar`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: oversized });
    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
});

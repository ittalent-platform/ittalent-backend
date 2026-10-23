import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MyProfileController } from '../../../src/modules/my-profile/my-profile.controller.js';
import type { MyProfileService } from '../../../src/modules/my-profile/my-profile.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

const USER_ID = '507f1f77bcf86cd799439011';
const mockProfile = {
  id: USER_ID,
  email: 'mine@example.test',
  username: 'mine',
  fullName: 'My Name',
  phone: null,
  avatarUrl: null,
  hasPassword: true,
  role: 'user' as const,
  status: 'active' as const,
  emailVerified: true,
  enterpriseId: null,
};

describe('MyProfileController', () => {
  let mockService: Partial<MyProfileService>;
  let controller: MyProfileController;

  beforeEach(() => {
    mockService = {
      get: vi.fn(),
      update: vi.fn(),
      replaceAvatar: vi.fn(),
    };
    controller = new MyProfileController(mockService as MyProfileService);
  });

  describe('get', () => {
    it('returns 200 with the current user profile', async () => {
      mockService.get = vi.fn().mockResolvedValue(mockProfile);
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const next = vi.fn();

      await controller.get({ user: { id: USER_ID } } as never, { status } as never, next);

      expect(mockService.get).toHaveBeenCalledWith(USER_ID);
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockProfile);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards 401 when req.user.id is missing', async () => {
      const next = vi.fn();

      await controller.get({} as never, {} as never, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED }),
      );
    });
  });

  describe('update', () => {
    it('returns 200 with the updated profile', async () => {
      const updated = { ...mockProfile, fullName: 'Updated Name' };
      mockService.update = vi.fn().mockResolvedValue(updated);
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const res = {
        status,
        locals: { validated: { body: { fullName: 'Updated Name' } } },
      } as never;
      const next = vi.fn();

      await controller.update({ user: { id: USER_ID } } as never, res, next);

      expect(mockService.update).toHaveBeenCalledWith(USER_ID, { fullName: 'Updated Name' });
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(updated);
    });

    it('forwards service errors to next', async () => {
      const error = new Error('Update failed');
      mockService.update = vi.fn().mockRejectedValue(error);
      const res = {
        status: vi.fn().mockReturnValue({ json: vi.fn() }),
        locals: { validated: { body: { fullName: 'Updated Name' } } },
      } as never;
      const next = vi.fn();

      await controller.update({ user: { id: USER_ID } } as never, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('uploadAvatar', () => {
    it('returns 200 when a valid file is attached', async () => {
      const file = { buffer: Buffer.from('img'), originalname: 'avatar.png', mimetype: 'image/png' } as Express.Multer.File;
      const updated = { ...mockProfile, avatarUrl: 'https://example.test/avatar.png' };
      mockService.replaceAvatar = vi.fn().mockResolvedValue(updated);
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const next = vi.fn();

      await controller.uploadAvatar({ user: { id: USER_ID }, file } as never, { status } as never, next);

      expect(mockService.replaceAvatar).toHaveBeenCalledWith(USER_ID, file);
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(updated);
    });

    it('forwards 400 when req.file is missing', async () => {
      const next = vi.fn();

      await controller.uploadAvatar({ user: { id: USER_ID } } as never, {} as never, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
          message: 'Avatar file is required',
        }),
      );
    });
  });
});

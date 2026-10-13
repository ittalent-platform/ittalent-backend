import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecruiterApplicationsController } from '../../../src/modules/applications/recruiter-applications.controller.js';
import type { RecruiterApplicationsService } from '../../../src/modules/applications/recruiter-applications.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('RecruiterApplicationsController', () => {
  let mockService: Partial<RecruiterApplicationsService>;
  let controller: RecruiterApplicationsController;

  beforeEach(() => {
    mockService = {
      listApplications: vi.fn(),
      getApplicationDetail: vi.fn(),
      getCvDownload: vi.fn(),
      addNote: vi.fn(),
      listNotes: vi.fn(),
    };
    controller = new RecruiterApplicationsController(mockService as RecruiterApplicationsService);
  });

  describe('addNote', () => {
    it('returns 201 with created note on success', async () => {
      const mockResult = {
        authorId: 'recruiter-1',
        authorName: 'Senior Recruiter',
        content: 'Promising candidate',
        createdAt: '2026-10-12T11:00:00.000Z',
      };
      mockService.addNote = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'recruiter-1', email: 'recruiter@enterprise.com', role: 'recruiter' },
      } as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { id: 'app-1' },
            body: { content: 'Promising candidate' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.addNote(req, res, next);

      expect(mockService.addNote).toHaveBeenCalledWith(
        'recruiter-1',
        'recruiter',
        'app-1',
        'Promising candidate',
      );
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
      expect(json).toHaveBeenCalledWith(mockResult);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards 401 to next when unauthenticated', async () => {
      const req = {} as never;
      const res = { locals: {} } as never;
      const next = vi.fn();

      await controller.addNote(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          message: 'Authentication required',
        }),
      );
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Application not found');
      mockService.addNote = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'recruiter-1', email: 'recruiter@enterprise.com', role: 'recruiter' },
      } as never;
      const res = {
        status: vi.fn(),
        locals: {
          validated: {
            params: { id: 'app-1' },
            body: { content: 'Promising candidate' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.addNote(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('listNotes', () => {
    it('returns 200 with notes list on success', async () => {
      const mockResult = {
        items: [
          {
            authorId: 'recruiter-1',
            authorName: 'Senior Recruiter',
            content: 'Promising candidate',
            createdAt: '2026-10-12T11:00:00.000Z',
          },
        ],
        total: 1,
      };
      mockService.listNotes = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'recruiter-1', email: 'recruiter@enterprise.com', role: 'recruiter' },
      } as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { id: 'app-1' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.listNotes(req, res, next);

      expect(mockService.listNotes).toHaveBeenCalledWith(
        'recruiter-1',
        'recruiter',
        'app-1',
      );
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards 401 to next when unauthenticated', async () => {
      const req = {} as never;
      const res = { locals: {} } as never;
      const next = vi.fn();

      await controller.listNotes(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          message: 'Authentication required',
        }),
      );
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Application not found');
      mockService.listNotes = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'recruiter-1', email: 'recruiter@enterprise.com', role: 'recruiter' },
      } as never;
      const res = {
        status: vi.fn(),
        locals: {
          validated: {
            params: { id: 'app-1' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.listNotes(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateStatus', () => {
    it('updates application status and returns HTTP 200', async () => {
      const mockResult = {
        id: 'app-1',
        status: 'under_review',
      };
      mockService.updateStatus = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'recruiter-1', email: 'recruiter@enterprise.com', role: 'recruiter' },
      } as never;
      const res = {
        status,
        json,
        locals: {
          validated: {
            params: { id: 'app-1' },
            body: { status: 'under_review', note: 'Moving to review' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.updateStatus(req, res, next);

      expect(mockService.updateStatus).toHaveBeenCalledWith(
        'recruiter-1',
        'recruiter',
        'app-1',
        { status: 'under_review', note: 'Moving to review' },
      );
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
    });

    it('rejects unauthenticated requests with HTTP 401', async () => {
      const req = {} as never;
      const res = {
        status: vi.fn(),
        locals: {},
      } as never;
      const next = vi.fn();

      await controller.updateStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          message: 'Authentication required',
        }),
      );
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Invalid status transition');
      mockService.updateStatus = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'recruiter-1', email: 'recruiter@enterprise.com', role: 'recruiter' },
      } as never;
      const res = {
        status: vi.fn(),
        locals: {
          validated: {
            params: { id: 'app-1' },
            body: { status: 'rejected' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.updateStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});


import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  Application,
  applicationOccupyingStatuses,
  applicationStatuses,
  APPLICATION_NOTE_MAX_LENGTH,
  APPLICATION_REASON_MAX_LENGTH,
} from '../../../src/models/application.model.js';
import {
  APPLICATION_MESSAGE_TO_CANDIDATE_MAX_LENGTH,
  APPLICATION_POSITION_FILLED_STATUS,
  APPLICATION_REASON_MIN_LENGTH,
  APPLICATION_TERMINAL_STATUSES,
  RECRUITER_ROLES,
} from '../../../src/modules/applications/applications.constants.js';

describe('Application domain model & constants (PR 1)', () => {
  describe('Status enum and occupying filter', () => {
    it('includes position_filled in applicationStatuses', () => {
      expect(applicationStatuses).toContain('position_filled');
      expect(applicationStatuses).toEqual([
        'submitted',
        'under_review',
        'interviewing',
        'offered',
        'hired',
        'rejected',
        'withdrawn',
        'position_filled',
      ]);
    });

    it('excludes terminal statuses (withdrawn, rejected, position_filled) from occupying statuses', () => {
      expect(applicationOccupyingStatuses).not.toContain('withdrawn');
      expect(applicationOccupyingStatuses).not.toContain('rejected');
      expect(applicationOccupyingStatuses).not.toContain('position_filled');
      expect(applicationOccupyingStatuses).toEqual([
        'submitted',
        'under_review',
        'interviewing',
        'offered',
        'hired',
      ]);
    });

    it('defines recruiter manager roles and terminal statuses in constants', () => {
      expect(RECRUITER_ROLES).toEqual(['recruiter', 'enterprise_admin']);
      expect(APPLICATION_POSITION_FILLED_STATUS).toBe('position_filled');
      expect(APPLICATION_TERMINAL_STATUSES).toEqual([
        'withdrawn',
        'rejected',
        'position_filled',
      ]);
      expect(APPLICATION_NOTE_MAX_LENGTH).toBe(2000);
      expect(APPLICATION_REASON_MIN_LENGTH).toBe(5);
      expect(APPLICATION_MESSAGE_TO_CANDIDATE_MAX_LENGTH).toBe(1000);
      expect(APPLICATION_REASON_MAX_LENGTH).toBe(500);
    });
  });

  describe('Application schema validation', () => {
    const validBaseData = {
      job_id: new Types.ObjectId(),
      applicant_id: new Types.ObjectId(),
      cv_id: new Types.ObjectId(),
      status: 'submitted' as const,
    };

    it('validates application with position_filled status', async () => {
      const doc = new Application({
        ...validBaseData,
        status: 'position_filled',
      });
      await expect(doc.validate()).resolves.toBeUndefined();
    });

    it('validates status_history entries with audit metadata', async () => {
      const authorId = new Types.ObjectId();
      const doc = new Application({
        ...validBaseData,
        status: 'rejected',
        status_history: [
          {
            status: 'rejected',
            changed_at: new Date(),
            changed_by: authorId,
            actor_role: 'recruiter',
            note: 'Candidate lacks required Go experience',
            message_to_candidate: 'Thank you for interviewing with us.',
            rejection_reason: 'Does not meet minimum requirements for the senior level',
          },
        ],
      });
      await expect(doc.validate()).resolves.toBeUndefined();
    });

    it('rejects status_history entry when audit strings exceed max bounds', async () => {
      const doc = new Application({
        ...validBaseData,
        status_history: [
          {
            status: 'under_review',
            changed_at: new Date(),
            changed_by: new Types.ObjectId(),
            note: 'a'.repeat(APPLICATION_REASON_MAX_LENGTH + 1),
          },
        ],
      });
      await expect(doc.validate()).rejects.toThrow();
    });

    it('validates embedded recruiter notes with required fields', async () => {
      const recruiterId = new Types.ObjectId();
      const doc = new Application({
        ...validBaseData,
        notes: [
          {
            author_id: recruiterId,
            author_name: 'Trần Bảo',
            content: 'Strong Kafka and microservices background from interview round 1.',
            created_at: new Date(),
          },
        ],
      });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.notes[0]?.author_name).toBe('Trần Bảo');
    });

    it('rejects note when content exceeds maximum length', async () => {
      const doc = new Application({
        ...validBaseData,
        notes: [
          {
            author_id: new Types.ObjectId(),
            author_name: 'Trần Bảo',
            content: 'x'.repeat(APPLICATION_NOTE_MAX_LENGTH + 1),
          },
        ],
      });
      await expect(doc.validate()).rejects.toThrow();
    });

    it('rejects note when required author fields are missing', async () => {
      const doc = new Application({
        ...validBaseData,
        notes: [
          {
            content: 'Valid content',
          },
        ],
      });
      await expect(doc.validate()).rejects.toThrow();
    });
  });
});

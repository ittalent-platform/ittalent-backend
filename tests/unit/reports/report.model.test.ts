import { describe, expect, it } from 'vitest';

import {
  Report,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  reportSchema,
} from '../../../src/models/report.model.js';
import {
  CLOSED_REPORT_STATUSES,
  OPEN_REPORT_STATUSES,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
} from '../../../src/modules/reports/reports.constants.js';

describe('Report Domain Model & Indexes', () => {
  describe('Enums and Configuration', () => {
    it('defines valid report target types', () => {
      expect(REPORT_TARGET_TYPES).toEqual(['job', 'company', 'user']);
    });

    it('defines valid report reasons with display labels', () => {
      expect(REPORT_REASONS).toEqual([
        'scam_or_fraud',
        'misleading_information',
        'discrimination',
        'inappropriate_content',
        'something_else',
      ]);

      for (const reason of REPORT_REASONS) {
        expect(REPORT_REASON_LABELS[reason]).toBeDefined();
        expect(typeof REPORT_REASON_LABELS[reason]).toBe('string');
      }
    });

    it('defines report statuses and lifecycle partitions', () => {
      expect(REPORT_STATUSES).toEqual([
        'pending',
        'reviewing',
        'resolved',
        'rejected',
        'withdrawn',
      ]);

      expect(OPEN_REPORT_STATUSES).toEqual(['pending', 'reviewing']);
      expect(CLOSED_REPORT_STATUSES).toEqual(['resolved', 'rejected', 'withdrawn']);

      for (const status of REPORT_STATUSES) {
        expect(REPORT_STATUS_LABELS[status]).toBeDefined();
      }
    });
  });

  describe('Schema Definition and Default Values', () => {
    it('configures default values for lifecycle and audit properties', () => {
      const statusPath = reportSchema.path('status');
      expect((statusPath as unknown as { defaultValue: string }).defaultValue).toBe('pending');

      const hiddenPath = reportSchema.path('hidden_by_reporter');
      expect((hiddenPath as unknown as { defaultValue: boolean }).defaultValue).toBe(false);

      const evidencePath = reportSchema.path('evidence_files');
      expect(evidencePath).toBeDefined();

      const historyPath = reportSchema.path('status_history');
      expect(historyPath).toBeDefined();
    });

    it('registers compound indexes for candidate listing, deduplication, and target lookup', () => {
      const indexes = reportSchema.indexes();
      const indexFields = indexes.map(([fields]) => fields);

      // Unique reference index is declared on path or schema
      const hasReferenceIndex =
        indexFields.some((f) => 'reference' in f) ||
        (reportSchema.path('reference') as unknown as { _index: unknown })._index !== undefined;
      expect(hasReferenceIndex).toBe(true);

      // Candidate dashboard query: reporter + non-hidden + newest first
      const hasReporterListIndex = indexFields.some(
        (f) => f.reporter_id === 1 && f.hidden_by_reporter === 1 && f.createdAt === -1,
      );
      expect(hasReporterListIndex).toBe(true);

      // Idempotency / duplicate check index
      const hasDeduplicationIndex = indexFields.some(
        (f) => f.reporter_id === 1 && f.target_type === 1 && f.target_id === 1 && f.status === 1,
      );
      expect(hasDeduplicationIndex).toBe(true);

      // Target lookup index
      const hasTargetIndex = indexFields.some((f) => f.target_type === 1 && f.target_id === 1);
      expect(hasTargetIndex).toBe(true);
    });

    it('registers the Mongoose Report model with collection "reports"', () => {
      expect(Report.modelName).toBe('Report');
      expect(Report.collection.collectionName).toBe('reports');
    });
  });
});

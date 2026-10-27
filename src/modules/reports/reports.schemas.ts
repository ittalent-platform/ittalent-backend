import { z } from 'zod';

import {
  REPORT_ACTIONS_TAKEN,
  REPORT_LIMITS,
  REPORT_PAGINATION,
  REPORT_REASON_CATEGORIES,
  REPORT_RESOLUTION_DECISIONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from './reports.constants.js';

export const reportIdParamSchema = z.strictObject({
  id: z.string().min(1, 'Report ID is required'),
});

export type ReportIdParam = z.infer<typeof reportIdParamSchema>;

export const createReportSchema = z.strictObject({
  target_type: z.enum(REPORT_TARGET_TYPES),
  target_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid target ID format'),
  reason_category: z.enum(REPORT_REASON_CATEGORIES),
  title: z
    .string()
    .trim()
    .min(REPORT_LIMITS.TITLE_MIN, `Title must be at least ${REPORT_LIMITS.TITLE_MIN} characters`)
    .max(REPORT_LIMITS.TITLE_MAX, `Title cannot exceed ${REPORT_LIMITS.TITLE_MAX} characters`),
  description: z
    .string()
    .trim()
    .min(REPORT_LIMITS.DESC_MIN, `Description must be at least ${REPORT_LIMITS.DESC_MIN} characters`)
    .max(REPORT_LIMITS.DESC_MAX, `Description cannot exceed ${REPORT_LIMITS.DESC_MAX} characters`),
  evidence_files: z
    .array(z.string().url('Evidence file must be a valid URL'))
    .max(REPORT_LIMITS.MAX_EVIDENCE_FILES, `Maximum ${REPORT_LIMITS.MAX_EVIDENCE_FILES} evidence files allowed`)
    .optional()
    .default([]),
  is_anonymous: z.boolean().optional().default(true),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const withdrawReportSchema = z.strictObject({
  withdrawal_reason: z
    .string()
    .trim()
    .max(REPORT_LIMITS.WITHDRAWAL_REASON_MAX, `Withdrawal reason cannot exceed ${REPORT_LIMITS.WITHDRAWAL_REASON_MAX} characters`)
    .optional(),
});

export type WithdrawReportInput = z.infer<typeof withdrawReportSchema>;

export const reporterReportsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(REPORT_PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(REPORT_PAGINATION.MAX_LIMIT).default(REPORT_PAGINATION.DEFAULT_LIMIT),
  status: z.enum(['all', ...REPORT_STATUSES]).optional().default('all'),
});

export type ReporterReportsQuery = z.infer<typeof reporterReportsQuerySchema>;

export const adminReportsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(REPORT_PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(REPORT_PAGINATION.MAX_LIMIT).default(REPORT_PAGINATION.DEFAULT_LIMIT),
  status: z.enum(['all', ...REPORT_STATUSES]).optional().default('pending'),
  target_type: z.enum(['all', ...REPORT_TARGET_TYPES]).optional().default('all'),
  category: z.enum(['all', ...REPORT_REASON_CATEGORIES]).optional().default('all'),
  search: z.string().trim().optional(),
});

export type AdminReportsQuery = z.infer<typeof adminReportsQuerySchema>;

export const adminResolveReportSchema = z
  .strictObject({
    decision: z.enum(REPORT_RESOLUTION_DECISIONS),
    action_taken: z.enum(REPORT_ACTIONS_TAKEN).optional(),
    internal_notes: z
      .string()
      .trim()
      .min(REPORT_LIMITS.INTERNAL_NOTES_MIN, `Internal notes must be at least ${REPORT_LIMITS.INTERNAL_NOTES_MIN} characters`)
      .max(REPORT_LIMITS.INTERNAL_NOTES_MAX, `Internal notes cannot exceed ${REPORT_LIMITS.INTERNAL_NOTES_MAX} characters`),
    message_to_reporter: z
      .string()
      .trim()
      .min(REPORT_LIMITS.MESSAGE_TO_REPORTER_MIN, `Message to reporter must be at least ${REPORT_LIMITS.MESSAGE_TO_REPORTER_MIN} characters`)
      .max(REPORT_LIMITS.MESSAGE_TO_REPORTER_MAX, `Message to reporter cannot exceed ${REPORT_LIMITS.MESSAGE_TO_REPORTER_MAX} characters`),
  })
  .refine(
    (data) => {
      if (data.decision === 'resolved' && !data.action_taken) {
        return false;
      }
      return true;
    },
    {
      message: 'Action taken is required when resolving a report',
      path: ['action_taken'],
    },
  );

export type AdminResolveReportInput = z.infer<typeof adminResolveReportSchema>;

export interface ReportTimelineDto {
  status: string;
  timestamp: string;
  note?: string | null;
}

export interface ReporterReportItemDto {
  id: string;
  ticket_id: string;
  target_type: string;
  target_id: string;
  target_title: string;
  target_link?: string | null;
  reason_category: string;
  title: string;
  description: string;
  evidence_files: string[];
  is_anonymous: boolean;
  status: string;
  withdrawal_reason?: string | null;
  withdrawn_at?: string | null;
  resolution_decision?: string | null;
  action_taken?: string | null;
  message_to_reporter?: string | null;
  resolved_at?: string | null;
  timeline: ReportTimelineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminReportItemDto extends ReporterReportItemDto {
  reporter: {
    id: string;
    email: string;
    full_name?: string | null;
    username?: string | null;
    created_at?: string | null;
  };
  assigned_admin?: {
    id: string;
    email: string;
    full_name?: string | null;
  } | null;
  reviewed_at?: string | null;
  internal_notes?: string | null;
}

export interface ReportKpisDto {
  total: number;
  pending: number;
  reviewing: number;
  resolved: number;
  rejected: number;
  withdrawn: number;
}

export interface PaginatedReportsResponse<T> {
  items: T[];
  kpis: ReportKpisDto;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

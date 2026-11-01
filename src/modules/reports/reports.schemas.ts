import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import {
  REPORT_ACTIONS_TAKEN,
  REPORT_CONFIG,
  REPORT_LIMITS,
  REPORT_MESSAGES,
  REPORT_PAGINATION,
  REPORT_REASON_CATEGORIES,
  REPORT_REASONS,
  REPORT_RESOLUTION_DECISIONS,
  REPORT_STATUS_FILTERS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} from './reports.constants.js';

const reportIdOrReferenceSchema = z
  .string()
  .trim()
  .refine(
    (val) => /^[0-9a-fA-F]{24}$/.test(val) || REPORT_CONFIG.REFERENCE_PATTERN.test(val),
    { message: 'Invalid report ID or reference format' },
  );

export const reportIdParamSchema = z.strictObject({
  id: reportIdOrReferenceSchema,
});

export type ReportIdParam = z.infer<typeof reportIdParamSchema>;

export const reportEvidenceFileInputSchema = z.object({
  fileUrl: z.string().url(),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export type ReportEvidenceFileInput = z.infer<typeof reportEvidenceFileInputSchema>;

export const createReportBodySchema = z.strictObject({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: objectIdSchema('target ID'),
  reason: z.enum(REPORT_REASONS, {
    message: REPORT_MESSAGES.REASON_REQUIRED,
  }),
  statement: z
    .string()
    .trim()
    .min(REPORT_CONFIG.MIN_STATEMENT_LENGTH, REPORT_MESSAGES.STATEMENT_REQUIRED)
    .max(REPORT_CONFIG.MAX_STATEMENT_LENGTH),
  idempotencyKey: z.string().trim().max(128).optional(),
  evidenceFiles: z.array(reportEvidenceFileInputSchema).max(REPORT_CONFIG.MAX_EVIDENCE_FILES).optional(),
});

export type CreateReportBody = z.infer<typeof createReportBodySchema>;

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

export const reportsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(REPORT_CONFIG.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(REPORT_CONFIG.MAX_LIMIT).default(REPORT_CONFIG.DEFAULT_LIMIT),
  status: z
    .enum(REPORT_STATUS_FILTERS, {
      message: REPORT_MESSAGES.INVALID_FILTER,
    })
    .default('all'),
  search: z.string().trim().max(REPORT_CONFIG.MAX_SEARCH_KEYWORD_LENGTH).optional(),
});

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;

export const adminReportsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(REPORT_PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(REPORT_PAGINATION.MAX_LIMIT).default(REPORT_PAGINATION.DEFAULT_LIMIT),
  status: z.enum(['all', 'open', 'closed', ...REPORT_STATUSES]).optional().default('pending'),
  target_type: z.enum(['all', ...REPORT_TARGET_TYPES]).optional().default('all'),
  category: z.enum(['all', ...REPORT_REASON_CATEGORIES, ...REPORT_REASONS]).optional().default('all'),
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
      message: 'Action taken is required when decision is resolved',
      path: ['action_taken'],
    },
  );

export type AdminResolveReportInput = z.infer<typeof adminResolveReportSchema>;

export const createReportResponseSchema = z.object({
  reference: z.string(),
  message: z.string(),
});

export type CreateReportResponse = z.infer<typeof createReportResponseSchema>;

export const reportTargetResponseSchema = z.object({
  type: z.enum(REPORT_TARGET_TYPES),
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  isAvailable: z.boolean(),
});

export const reportItemResponseSchema = z.object({
  id: z.string(),
  reference: z.string(),
  target: reportTargetResponseSchema,
  reason: z.enum(REPORT_REASONS),
  reasonLabel: z.string(),
  submittedAt: z.string(),
  status: z.enum(REPORT_STATUSES),
  statusLabel: z.string(),
});

export type ReportItemResponse = z.infer<typeof reportItemResponseSchema>;

export const reportsCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
});

export type ReportsCounts = z.infer<typeof reportsCountsSchema>;

export const paginatedReportsResponseSchema = z.object({
  items: z.array(reportItemResponseSchema),
  counts: reportsCountsSchema,
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type PaginatedReportsResponse = z.infer<typeof paginatedReportsResponseSchema>;

export const reportFileResponseSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  size: z.number().int().nonnegative(),
  mimeType: z.string(),
  downloadUrl: z.string().url(),
});

export type ReportFileResponse = z.infer<typeof reportFileResponseSchema>;

export const reportHistoryEntrySchema = z.object({
  event: z.string(),
  label: z.string(),
  timestamp: z.string(),
});

export type ReportHistoryEntry = z.infer<typeof reportHistoryEntrySchema>;

export const reportDetailResponseSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.enum(REPORT_STATUSES),
  statusLabel: z.string(),
  statusDescription: z.string(),
  submittedAt: z.string(),
  target: reportTargetResponseSchema,
  reason: z.enum(REPORT_REASONS),
  reasonLabel: z.string(),
  statement: z.string(),
  files: z.array(reportFileResponseSchema),
  responseFromPlatform: z.string().nullable(),
  history: z.array(reportHistoryEntrySchema),
  canWithdraw: z.boolean(),
  canHide: z.boolean(),
});

export type ReportDetailResponse = z.infer<typeof reportDetailResponseSchema>;

export const reportWithdrawResponseSchema = z.object({
  reference: z.string(),
  status: z.literal('withdrawn'),
  message: z.string(),
});

export type ReportWithdrawResponse = z.infer<typeof reportWithdrawResponseSchema> & {
  report: ReporterReportItemDto;
};

export const reportHideResponseSchema = z.object({
  reference: z.string(),
  hidden: z.literal(true),
  message: z.string(),
});

export type ReportHideResponse = z.infer<typeof reportHideResponseSchema>;

export interface ReportTimelineEventDto {
  status: string;
  timestamp: string;
  actor_id?: string | null;
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
  timeline: ReportTimelineEventDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminReportItemDto extends ReporterReportItemDto {
  reference?: string;
  reason?: string;
  statement?: string;
  files?: ReportFileResponse[];
  assigned_admin?: {
    id: string;
    email: string;
    full_name: string | null;
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

export interface PaginatedAdminReportsResponse<T> {
  items: T[];
  kpis: ReportKpisDto;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

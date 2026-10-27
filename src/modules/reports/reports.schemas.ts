import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import {
  REPORT_CONFIG,
  REPORT_MESSAGES,
  REPORT_REASONS,
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

export const reportHistoryEntrySchema = z.object({
  event: z.string(),
  label: z.string(),
  timestamp: z.string(),
});

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

export type ReportWithdrawResponse = z.infer<typeof reportWithdrawResponseSchema>;

export const reportHideResponseSchema = z.object({
  reference: z.string(),
  hidden: z.literal(true),
  message: z.string(),
});

export type ReportHideResponse = z.infer<typeof reportHideResponseSchema>;

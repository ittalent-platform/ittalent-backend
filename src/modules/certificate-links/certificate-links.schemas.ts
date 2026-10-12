import { isIP } from 'node:net';
import { z } from 'zod';

import { PAGINATION } from '../../shared/constants/pagination.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { CERTIFICATE_LINKS } from './certificate-links.constants.js';

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== CERTIFICATE_LINKS.IPV4_SEGMENT_COUNT || octets.some((octet) => !Number.isInteger(octet) || octet < CERTIFICATE_LINKS.IPV4_UNSPECIFIED_FIRST || octet > CERTIFICATE_LINKS.IPV4_OCTET_MAX)) return false;
  const [first, second] = octets as [number, number, number, number];
  return first === CERTIFICATE_LINKS.IPV4_UNSPECIFIED_FIRST || first === CERTIFICATE_LINKS.IPV4_PRIVATE_A_FIRST
    || first === CERTIFICATE_LINKS.IPV4_LOOPBACK_FIRST
    || (first === CERTIFICATE_LINKS.IPV4_LINK_LOCAL_FIRST && second === CERTIFICATE_LINKS.IPV4_LINK_LOCAL_SECOND)
    || (first === CERTIFICATE_LINKS.IPV4_CARRIER_GRADE_NAT_FIRST && second >= CERTIFICATE_LINKS.IPV4_CARRIER_GRADE_NAT_SECOND_MIN && second <= CERTIFICATE_LINKS.IPV4_CARRIER_GRADE_NAT_SECOND_MAX)
    || (first === CERTIFICATE_LINKS.IPV4_PRIVATE_B_FIRST && second >= CERTIFICATE_LINKS.IPV4_PRIVATE_B_SECOND_MIN && second <= CERTIFICATE_LINKS.IPV4_PRIVATE_B_SECOND_MAX)
    || (first === CERTIFICATE_LINKS.IPV4_PRIVATE_C_FIRST && second === CERTIFICATE_LINKS.IPV4_PRIVATE_C_SECOND)
    || (first === CERTIFICATE_LINKS.IPV4_PROTOCOL_ASSIGNMENT_FIRST && second === CERTIFICATE_LINKS.IPV4_PROTOCOL_ASSIGNMENT_SECOND)
    || (first === CERTIFICATE_LINKS.IPV4_BENCHMARK_FIRST && second >= CERTIFICATE_LINKS.IPV4_BENCHMARK_SECOND_MIN && second <= CERTIFICATE_LINKS.IPV4_BENCHMARK_SECOND_MAX)
    || first >= CERTIFICATE_LINKS.IPV4_MULTICAST_FIRST_MIN;
}

function isPrivateIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd')
    || /^fe[89ab]/.test(address) || address.startsWith('ff') || address.startsWith('::ffff:');
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || hostname.endsWith('.internal') || !hostname.includes('.')) return false;
    if (isIP(hostname) === CERTIFICATE_LINKS.IPV4_VERSION && isPrivateIpv4(hostname)) return false;
    if (isIP(hostname.replace(/^\[|\]$/g, '')) === CERTIFICATE_LINKS.IPV6_VERSION && isPrivateIpv6(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isCalendarDate(value: string): boolean {
  if (!CERTIFICATE_LINKS.CALENDAR_DATE_FORMAT.test(value)) return false;
  const date = new Date(`${value}${CERTIFICATE_LINKS.DATE_SUFFIX}`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, CERTIFICATE_LINKS.DATE_STRING_LENGTH) === value;
}

const calendarDateSchema = z.string().refine(isCalendarDate, 'Date must be a valid YYYY-MM-DD calendar date');

const nameSchema = z.string().trim().min(1).max(CERTIFICATE_LINKS.NAME_MAX_LENGTH);
const urlSchema = z.string().trim().max(CERTIFICATE_LINKS.URL_MAX_LENGTH).refine(isSafeExternalUrl, 'URL must be a safe external HTTP or HTTPS URL');
const issuerSchema = z.string().trim().min(1).max(CERTIFICATE_LINKS.ISSUER_MAX_LENGTH);
const DATE_ORDER_ISSUE = { message: 'Expiry date must not precede issued date', path: ['expiryDate'] };

export function datesInOrder(issuedDate?: string | null, expiryDate?: string | null): boolean {
  return !issuedDate || !expiryDate || expiryDate >= issuedDate;
}

export const createCertificateLinkSchema = z.strictObject({
  name: nameSchema,
  url: urlSchema,
  issuer: issuerSchema.optional(),
  issuedDate: calendarDateSchema.optional(),
  expiryDate: calendarDateSchema.optional(),
}).refine((input) => datesInOrder(input.issuedDate, input.expiryDate), DATE_ORDER_ISSUE);

// null clears an optional field; the merged result is checked for date order in the service.
export const updateCertificateLinkSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  name: nameSchema.optional(),
  url: urlSchema.optional(),
  issuer: issuerSchema.nullable().optional(),
  issuedDate: calendarDateSchema.nullable().optional(),
  expiryDate: calendarDateSchema.nullable().optional(),
  suggested: z.boolean().optional(),
}).refine((input) => Object.keys(input).some((key) => key !== 'expectedVersion'), { message: 'Provide at least one field to change' })
  .refine((input) => datesInOrder(input.issuedDate, input.expiryDate), DATE_ORDER_ISSUE);

export const certificateLinkIdParamSchema = z.object({ id: objectIdSchema('certificate link ID') });

export const deleteCertificateLinkQuerySchema = z.strictObject({
  expectedVersion: z.coerce.number().int().min(1),
});

export const certificateLinkListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(PAGINATION.DEFAULT_PAGE).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: z.string().trim().min(1).max(CERTIFICATE_LINKS.SEARCH_MAX_LENGTH).optional(),
});

export const idempotencyKeySchema = z.string().trim().min(1).max(CERTIFICATE_LINKS.IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(/^[\x21-\x7e]+$/, 'Idempotency-Key must contain printable ASCII characters');

export const certificateLinkResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  issuer: z.string().nullable(),
  issuedDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  version: z.number().int(),
  status: z.literal('available'),
  suggested: z.boolean(),
  sentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const paginatedCertificateLinksSchema = z.object({
  items: z.array(certificateLinkResponseSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  suggestedTotal: z.number().int(),
});

export type CreateCertificateLinkInput = z.infer<typeof createCertificateLinkSchema>;
export type UpdateCertificateLinkInput = z.infer<typeof updateCertificateLinkSchema>;
export type CertificateLinkListQuery = z.infer<typeof certificateLinkListQuerySchema>;
export type CertificateLinkResponse = z.infer<typeof certificateLinkResponseSchema>;

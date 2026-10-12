export const registrationStatuses = [
  'draft',
  'pending_review',
  'under_review',
  'approved',
  'rejected',
] as const;

export type EnterpriseRegistrationStatus = (typeof registrationStatuses)[number];

export const legalDocumentTypes = [
  'business_license',
  'tax_registration',
  'power_of_attorney',
  'other',
] as const;

export type LegalDocumentType = (typeof legalDocumentTypes)[number];

export const adminDecisionTypes = ['approved', 'rejected'] as const;

export type AdminDecisionType = (typeof adminDecisionTypes)[number];

/**
 * Common consumer and personal email domains blocked for corporate registration (BR-27).
 * Representatives must submit a domain belonging to their organization.
 */
export const BLOCKED_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'mail.com',
  'zoho.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'fastmail.com',
] as const;

export const REGISTRATION_CONFIG = {
  /**
   * Catches standardized registration case identifiers.
   * Format: 'REG-' followed by 8-digit date (YYYYMMDD), a hyphen, and 4 to 6 uppercase alphanumeric characters.
   * Example matches: 'REG-20261011-0042', 'REG-20261011-A1B2C'
   */
  CODE_REGEX: /^REG-\d{8}-[A-Z0-9]{4,6}$/,

  /**
   * Catches Vietnamese tax identification numbers (BR-39).
   * Format: exactly 10 numeric digits (headquarter / independent legal entity)
   * or 13 numeric digits (branch or dependent accounting sub-unit).
   * Example matches: '0101234567' (10 digits), '0101234567-001' (standardized to 13 digits '0101234567001')
   */
  TAX_CODE_REGEX: /^[0-9]{10,13}$/,

  /**
   * Catches international and domestic phone numbers.
   * Format: optional leading '+', followed by 8 to 20 digits, spaces, parentheses, dots, or hyphens.
   * Example matches: '+84901234567', '0901234567', '+1 (555) 019-2834'
   */
  PHONE_REGEX: /^[+]?[0-9\s().-]{8,20}$/,

  REPRESENTATIVE_NAME_MIN_LENGTH: 2,
  REPRESENTATIVE_NAME_MAX_LENGTH: 100,

  COMPANY_NAME_MIN_LENGTH: 2,
  COMPANY_NAME_MAX_LENGTH: 150,

  LEGAL_NAME_MAX_LENGTH: 200,
  REGISTRATION_NUMBER_MAX_LENGTH: 100,
  POSITION_MAX_LENGTH: 100,
  INDUSTRY_MIN_LENGTH: 2,
  INDUSTRY_MAX_LENGTH: 100,
  SHORT_DESC_MAX_LENGTH: 300,
  DESCRIPTION_MAX_LENGTH: 3000,
  MIN_FOUNDED_YEAR: 1800,

  STREET_MAX_LENGTH: 200,
  CITY_MAX_LENGTH: 100,
  DISTRICT_MAX_LENGTH: 100,
  STATE_PROVINCE_MAX_LENGTH: 100,
  COUNTRY_MAX_LENGTH: 100,
  POSTAL_CODE_MAX_LENGTH: 20,

  FILE_NAME_MAX_LENGTH: 255,
  TOKEN_MIN_LENGTH: 16,
  TOKEN_BYTES: 32,
  CODE_RANDOM_BYTES: 3,
  DATE_PAD_LENGTH: 2,
  SEARCH_MIN_LENGTH: 1,
  SEARCH_MAX_LENGTH: 100,

  /**
   * Minimum explanation length required when an administrator rejects a registration (BR-42).
   * Enforces actionable, concrete feedback for the applicant enterprise.
   */
  REJECTION_REASON_MIN_LENGTH: 20,
  REJECTION_REASON_MAX_LENGTH: 1000,

  /**
   * Lifetime of email verification magic link sent during registration intake (BR-28).
   */
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: 24,

  /**
   * Lifetime of the single-use onboarding password setup invitation link sent upon approval (BR-43).
   */
  INVITATION_TOKEN_TTL_DAYS: 7,

  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

export const REGISTRATION_MESSAGES = {
  NOT_FOUND: 'Enterprise registration case not found',
  PERSONAL_EMAIL_REJECTED: 'Personal or generic email domains are not permitted. Please use your corporate organization email address',
  EMAIL_ALREADY_EXISTS: 'This email is already associated with an active enterprise or pending registration',
  CANDIDATE_CANNOT_REGISTER: 'Candidate accounts cannot register an enterprise',
  MAGIC_LINK_SENT: 'Verification magic link dispatched to corporate email address',
  EMAIL_VERIFIED: 'Corporate email verified successfully',
  TAX_CODE_ALREADY_CLAIMED: 'This tax identification code is already registered or currently locked in a pending registration review',
  MISSING_LEGAL_DOCUMENTS: 'At least one valid business registration license document is mandatory for review submission',
  INVALID_VERSION: 'Registration version mismatch. A newer version of this case has already been submitted',
  ALREADY_SUBMITTED: 'This registration case has already been submitted and cannot be modified in draft mode',
  NOT_PENDING_REVIEW: 'Only registration cases in pending or under review status can receive an administrative decision',
  REJECTION_REASON_REQUIRED: 'A rejection reason of at least 20 characters is mandatory to provide clear remediation feedback',
  CHECKLIST_INCOMPLETE: 'All verification checklist items must be verified prior to approving an enterprise account',
  TOKEN_INVALID_OR_EXPIRED: 'Verification link is invalid, revoked, or has expired. Please initiate a new registration',
  DOCUMENT_FILE_REQUIRED: 'Document file is required',
  DOCUMENT_FILE_EMPTY: 'Document file is empty',
  PDF_DOCUMENT_REQUIRED: 'Only valid PDF files are accepted for enterprise legal documents',
  DOCUMENT_FILE_SIZE_LIMIT: 'Document file cannot exceed 5MB',
  SUBMISSION_SUCCESS: 'Enterprise registration submitted successfully for review',
} as const;

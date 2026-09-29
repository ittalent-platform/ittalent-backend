import type { EnterpriseStatus } from '../../models/enterprise.model.js';

export const ENTERPRISE_MESSAGES = {
  NOT_FOUND: 'Enterprise not found',

  TAX_CODE_ALREADY_EXISTS: 'This tax identification code is already registered by another enterprise',
  EMAIL_ALREADY_EXISTS: 'This corporate email address is already registered on the platform',
  CREATOR_ALREADY_OWNS_ENTERPRISE: 'Your account is already associated with a registered enterprise profile',

  UNAUTHORIZED_UPDATE: 'You do not have permission to modify this enterprise profile',
  TAX_CODE_IMMUTABLE: 'Tax identification code cannot be modified once approved',

  INVALID_STATUS_TRANSITION: 'The requested status transition violates platform lifecycle rules',
  REASON_REQUIRED: 'A justification reason of at least 10 characters is mandatory when suspending or rejecting an enterprise',
  CANNOT_DELETE_WITH_ACTIVE_JOBS: 'Cannot delete enterprise with active job postings. Please close all postings first',

  CREATED_SUCCESS: 'Enterprise profile registered successfully and submitted for administrative review',
  UPDATED_SUCCESS: 'Enterprise profile information updated successfully',
  STATUS_UPDATED_SUCCESS: 'Enterprise account status updated successfully',
  DELETED_SUCCESS: 'Enterprise profile deleted successfully',
} as const;

export const ENTERPRISE_CONFIG = {
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 150,

  LEGAL_NAME_MAX_LENGTH: 200,
  REGISTRATION_NUMBER_MAX_LENGTH: 100,

  STREET_MAX_LENGTH: 200,
  CITY_MAX_LENGTH: 100,
  DISTRICT_MAX_LENGTH: 100,
  STATE_PROVINCE_MAX_LENGTH: 100,
  COUNTRY_MAX_LENGTH: 100,
  POSTAL_CODE_MAX_LENGTH: 20,

  INDUSTRY_MIN_LENGTH: 2,
  INDUSTRY_MAX_LENGTH: 100,
  SUB_INDUSTRY_MAX_LENGTH: 50,

  MIN_FOUNDED_YEAR: 1800,

  WORKING_DAYS_MAX_LENGTH: 100,

  TAX_CODE_REGEX: /^[0-9]{10,13}$/,
  PHONE_REGEX: /^[+]?[0-9\s().-]{8,20}$/,

  KEYWORD_MIN_LENGTH: 1,
  KEYWORD_MAX_LENGTH: 100,

  REASON_MIN_LENGTH: 10,
  REASON_MAX_LENGTH: 500,

  SHORT_DESC_MAX_LENGTH: 300,

  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

export const PUBLIC_ENTERPRISE_STATUS: EnterpriseStatus = 'active';

export const VALID_STATUS_TRANSITIONS: Record<EnterpriseStatus, readonly EnterpriseStatus[]> = {
  pending: ['active', 'rejected'],
  active: ['suspended', 'inactive'],
  suspended: ['active'],
  rejected: ['pending'],
  inactive: ['active'],
  deleted: [],
};
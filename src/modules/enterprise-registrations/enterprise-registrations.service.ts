import { createHash, randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { TIME_MS } from '../../shared/constants/time.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { sendEnterpriseRegistrationMagicLink } from '../../shared/services/email.service.js';
import { enterprisesRepository, type EnterprisesRepository } from '../enterprises/enterprises.repository.js';
import { usersRepository, type UsersRepository } from '../users/users.repository.js';
import { isValidPdf, storageService } from '../../shared/services/storage.service.js';
import type {
  EnterpriseRegistrationDoc,
  LegalDocumentData,
  RegistrationCompanyData,
} from '../../models/enterprise-registration.model.js';
import {
  BLOCKED_EMAIL_DOMAINS,
  type LegalDocumentType,
  REGISTRATION_CONFIG,
  REGISTRATION_MESSAGES,
} from './enterprise-registrations.constants.js';
import {
  enterpriseRegistrationsRepository,
  type EnterpriseRegistrationsRepository,
} from './enterprise-registrations.repository.js';
import type {
  SaveDraftDTO,
  StartRegistrationDTO,
  SubmitRegistrationDTO,
} from './enterprise-registrations.schemas.js';

export interface StartRegistrationResult {
  message: string;
  email: string;
}

export interface VerifyEmailResult {
  message: string;
  registration_id: string;
  registration_code: string;
  status: string;
  version: number;
  corporate_email: string;
  representative: {
    full_name: string;
    phone: string;
    position?: string | undefined;
  };
}

export interface SubmissionReceiptResult {
  registration_code: string;
  status: string;
  version: number;
  submitted_at: string;
  estimated_sla_days: number;
}

export class EnterpriseRegistrationsService {
  constructor(
    private readonly repository: EnterpriseRegistrationsRepository = enterpriseRegistrationsRepository,
    private readonly enterpriseRepo: EnterprisesRepository = enterprisesRepository,
    private readonly userRepo: UsersRepository = usersRepository,
  ) {}

  generateRegistrationCode(date = new Date()): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(REGISTRATION_CONFIG.DATE_PAD_LENGTH, '0');
    const dd = String(date.getDate()).padStart(REGISTRATION_CONFIG.DATE_PAD_LENGTH, '0');
    const randomSuffix = randomBytes(REGISTRATION_CONFIG.CODE_RANDOM_BYTES).toString('hex').toUpperCase();
    return `REG-${yyyy}${mm}${dd}-${randomSuffix}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async startRegistration(input: StartRegistrationDTO): Promise<StartRegistrationResult> {
    const corporateEmail = input.corporate_email.trim().toLowerCase();
    const domain = corporateEmail.split('@')[1];

    // [BR-27 / EX1]: Corporate email domain check.
    // Personal or consumer webmail providers (e.g., gmail, yahoo, hotmail) are prohibited.
    if (domain && (BLOCKED_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        REGISTRATION_MESSAGES.PERSONAL_EMAIL_REJECTED,
      );
    }

    const existingUser = await this.userRepo.findByEmail(corporateEmail);
    if (existingUser) {
      // [PRE-2 / BR-40 / EX1]: Candidate role conflict.
      // Users with active candidate/applicant accounts cannot request an enterprise.
      if (existingUser.role === 'applicant' || existingUser.role === 'user') {
        throw createHttpError(
          HTTP_STATUS.HTTP_409_CONFLICT,
          REGISTRATION_MESSAGES.CANDIDATE_CANNOT_REGISTER,
        );
      }
      // [PRE-2 / EX2]: Existing enterprise association conflict.
      // An account already tied to a registered company cannot initiate a new enterprise intake.
      if (existingUser.enterprise_id) {
        throw createHttpError(
          HTTP_STATUS.HTTP_409_CONFLICT,
          REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS,
        );
      }
    }

    // [PRE-2 / EX2]: Active organization conflict.
    // Email already belongs to an existing, verified enterprise entity.
    const existingEnterprise = await this.enterpriseRepo.findByEmail(corporateEmail);
    if (existingEnterprise) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS,
      );
    }

    // [BR-42 / EX3]: Exclusive claim lock check.
    // Prohibit intake if an active registration is currently in pending_review or under_review.
    const hasPending = await this.repository.hasPendingRegistrationByEmail(corporateEmail);
    if (hasPending) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS,
      );
    }

    // [BR-28]: Generate single-use verification token with 24-hour expiration window.
    const rawToken = randomBytes(REGISTRATION_CONFIG.TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + REGISTRATION_CONFIG.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * TIME_MS.ONE_HOUR,
    );

    // [AC.1]: Save and Resume Draft support.
    // If an unverified draft exists, update representative info and regenerate verification token.
    const existingDraft = await this.repository.findDraftByEmail(corporateEmail);
    if (existingDraft) {
      existingDraft.representative = {
        full_name: input.representative_name.trim(),
        phone: input.representative_phone.trim(),
      };
      existingDraft.verification_token = {
        token_hash: tokenHash,
        expires_at: expiresAt,
      };
      await existingDraft.save();
    } else {
      // [POST-1]: Initialize a persistent draft case (REG-YYYYMMDD-XXXX, version v1).
      const registrationCode = this.generateRegistrationCode();
      await this.repository.create({
        registration_code: registrationCode,
        version: 1,
        corporate_email: corporateEmail,
        representative: {
          full_name: input.representative_name.trim(),
          phone: input.representative_phone.trim(),
        },
        status: 'draft',
        verification_token: {
          token_hash: tokenHash,
          expires_at: expiresAt,
        },
      });
    }

    // Dispatch magic link email to representative's corporate inbox.
    const baseUrl = env.APP_BASE_URL.replace(/\/$/, '');
    const verificationUrl = `${baseUrl}/enterprise-registration/verify?token=${rawToken}`;
    await sendEnterpriseRegistrationMagicLink(
      corporateEmail,
      input.representative_name,
      verificationUrl,
    );

    return {
      message: REGISTRATION_MESSAGES.MAGIC_LINK_SENT,
      email: corporateEmail,
    };
  }

  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    const tokenHash = this.hashToken(token);
    const registration = await this.repository.findByTokenHash(tokenHash);

    // [EX5]: Token validity check.
    // Reject if verification token hash cannot be matched against any registration draft.
    if (!registration) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        REGISTRATION_MESSAGES.TOKEN_INVALID_OR_EXPIRED,
      );
    }

    // [BR-28 / EX5]: Expiration enforcement.
    // Reject if verification link is older than 24 hours.
    const expiresAt = registration.verification_token?.expires_at;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        REGISTRATION_MESSAGES.TOKEN_INVALID_OR_EXPIRED,
      );
    }

    // [POST-1]: Transition case to verified draft, activating multi-step wizard session.
    registration.verification_token = {
      ...(registration.verification_token ?? {}),
      token_hash: registration.verification_token?.token_hash,
      expires_at: expiresAt,
      verified_at: new Date(),
    };
    registration.status = 'draft';
    await registration.save();

    return {
      message: REGISTRATION_MESSAGES.EMAIL_VERIFIED,
      registration_id: registration._id.toString(),
      registration_code: registration.registration_code,
      status: registration.status,
      version: registration.version,
      corporate_email: registration.corporate_email,
      representative: {
        full_name: registration.representative.full_name,
        phone: registration.representative.phone,
        position: registration.representative.position,
      },
    };
  }

  async getRegistration(idOrCode: string): Promise<EnterpriseRegistrationDoc> {
    const registration = await this.repository.findByIdOrCode(idOrCode);
    if (!registration) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REGISTRATION_MESSAGES.NOT_FOUND);
    }
    return registration;
  }

  async saveDraft(idOrCode: string, payload: SaveDraftDTO): Promise<EnterpriseRegistrationDoc> {
    const registration = await this.repository.findByIdOrCode(idOrCode);
    if (!registration) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REGISTRATION_MESSAGES.NOT_FOUND);
    }

    // [BR-40]: Draft mutation guard.
    // Modifications are strictly permitted only while the case remains in 'draft' status.
    if (registration.status !== 'draft') {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.ALREADY_SUBMITTED);
    }

    // Optimistic concurrency control.
    if (payload.version !== undefined && payload.version !== registration.version) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.INVALID_VERSION);
    }

    if (payload.representative) {
      registration.representative = {
        full_name: payload.representative.full_name ?? registration.representative.full_name,
        phone: payload.representative.phone ?? registration.representative.phone,
        position: payload.representative.position ?? registration.representative.position,
      };
    }

    if (payload.company_data) {
      registration.company_data = {
        name: payload.company_data.name ?? registration.company_data?.name ?? '',
        legal_name: payload.company_data.legal_name ?? registration.company_data?.legal_name,
        tax_code: payload.company_data.tax_code ?? registration.company_data?.tax_code ?? '',
        registration_number: payload.company_data.registration_number ?? registration.company_data?.registration_number,
        website: payload.company_data.website ?? registration.company_data?.website,
        industry: payload.company_data.industry ?? registration.company_data?.industry ?? '',
        sub_industries: payload.company_data.sub_industries ?? registration.company_data?.sub_industries,
        company_size: payload.company_data.company_size ?? registration.company_data?.company_size ?? '1-10',
        company_type: payload.company_data.company_type ?? registration.company_data?.company_type,
        founded_year: payload.company_data.founded_year ?? registration.company_data?.founded_year,
        address: {
          street: payload.company_data.address?.street ?? registration.company_data?.address?.street ?? '',
          city: payload.company_data.address?.city ?? registration.company_data?.address?.city ?? '',
          district: payload.company_data.address?.district ?? registration.company_data?.address?.district,
          state_province: payload.company_data.address?.state_province ?? registration.company_data?.address?.state_province,
          country: payload.company_data.address?.country ?? registration.company_data?.address?.country ?? '',
          postal_code: payload.company_data.address?.postal_code ?? registration.company_data?.address?.postal_code,
        },
        short_description: payload.company_data.short_description ?? registration.company_data?.short_description,
        description: payload.company_data.description ?? registration.company_data?.description,
      };
    }

    if (payload.legal_documents) {
      registration.legal_documents = payload.legal_documents.map((doc) => ({
        document_type: doc.document_type,
        file_name: doc.file_name,
        file_url: doc.file_url,
        file_size: doc.file_size,
        uploaded_at: new Date(),
      }));
    }

    registration.version += 1;
    await registration.save();
    return registration;
  }

  async uploadLegalDocument(
    idOrCode: string,
    file: Express.Multer.File | undefined,
    documentType: LegalDocumentType,
  ): Promise<LegalDocumentData> {
    if (!file) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REGISTRATION_MESSAGES.DOCUMENT_FILE_REQUIRED);
    }

    if (file.size <= 0) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REGISTRATION_MESSAGES.DOCUMENT_FILE_EMPTY);
    }

    // [BR-41 / EX4]: Mandatory PDF format integrity.
    // Pure magic byte verification ensures file matches %PDF- specification.
    if (!isValidPdf(file.buffer)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REGISTRATION_MESSAGES.PDF_DOCUMENT_REQUIRED);
    }

    const registration = await this.repository.findByIdOrCode(idOrCode);
    if (!registration) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REGISTRATION_MESSAGES.NOT_FOUND);
    }

    // [BR-40]: Draft mutation guard.
    if (registration.status !== 'draft') {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.ALREADY_SUBMITTED);
    }

    const uploadResult = await storageService.uploadFile({
      buffer: file.buffer,
      fileName: file.originalname,
      folder: 'italent/enterprise-legal-documents',
      prefix: `legal-${documentType}`,
      resourceType: 'raw',
      mimeType: 'application/pdf',
    });

    const docEntry: LegalDocumentData = {
      document_type: documentType,
      file_name: file.originalname,
      file_url: uploadResult.fileUrl,
      file_size: file.size,
      uploaded_at: new Date(),
    };

    const currentDocs = registration.legal_documents ?? [];
    const existingIndex = currentDocs.findIndex((d) => d.document_type === documentType);
    if (existingIndex >= 0) {
      currentDocs[existingIndex] = docEntry;
    } else {
      currentDocs.push(docEntry);
    }
    registration.legal_documents = currentDocs;
    registration.version += 1;
    await registration.save();

    return docEntry;
  }

  async submitRegistration(
    idOrCode: string,
    payload: SubmitRegistrationDTO,
  ): Promise<SubmissionReceiptResult> {
    const registration = await this.repository.findByIdOrCode(idOrCode);
    if (!registration) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, REGISTRATION_MESSAGES.NOT_FOUND);
    }

    // [BR-40]: Draft status enforcement.
    if (registration.status !== 'draft') {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.ALREADY_SUBMITTED);
    }

    // Optimistic concurrency control.
    if (payload.version !== registration.version) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.INVALID_VERSION);
    }

    // [BR-41 / EX4]: Mandatory business registration certificate check.
    const allLegalDocs = [
      ...(registration.legal_documents ?? []),
      ...payload.legal_documents,
    ];
    const hasBusinessLicense = allLegalDocs.some((d) => d.document_type === 'business_license');
    if (!hasBusinessLicense) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REGISTRATION_MESSAGES.MISSING_LEGAL_DOCUMENTS);
    }

    // [BR-39]: Tax identification code uniqueness check against active registered enterprises.
    const taxCode = payload.company_data.tax_code.trim();
    const existingEnterprise = await this.enterpriseRepo.findByTaxCode(taxCode);
    if (existingEnterprise) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.TAX_CODE_ALREADY_CLAIMED);
    }

    // [BR-42 / EX3]: Exclusive claim collision check against pending or under-review registrations.
    const hasActiveConflict = await this.repository.hasActiveClaim(
      registration.corporate_email,
      taxCode,
      registration._id,
    );
    if (hasActiveConflict) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.TAX_CODE_ALREADY_CLAIMED);
    }

    // Corporate email uniqueness check against registered enterprises.
    const existingEmailEnterprise = await this.enterpriseRepo.findByEmail(registration.corporate_email);
    if (existingEmailEnterprise) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    // Merge finalized submission payload.
    registration.representative = {
      full_name: payload.representative.full_name,
      phone: payload.representative.phone,
      position: payload.representative.position,
    };
    registration.company_data = payload.company_data as RegistrationCompanyData;

    // Merge legal documents if provided in payload.
    if (payload.legal_documents && payload.legal_documents.length > 0) {
      const mergedMap = new Map<string, LegalDocumentData>();
      for (const doc of registration.legal_documents ?? []) {
        mergedMap.set(doc.document_type, doc);
      }
      for (const doc of payload.legal_documents) {
        mergedMap.set(doc.document_type, {
          document_type: doc.document_type,
          file_name: doc.file_name,
          file_url: doc.file_url,
          file_size: doc.file_size,
          uploaded_at: new Date(),
        });
      }
      registration.legal_documents = Array.from(mergedMap.values());
    }

    // [BR-42 / EX3]: Acquire exclusive claim locks.
    const submittedAt = new Date();
    registration.claim_locks = {
      tax_code: taxCode,
      corporate_email: registration.corporate_email,
      locked_at: submittedAt,
    };
    registration.status = 'pending_review';
    registration.version += 1;
    await registration.save();

    return {
      registration_code: registration.registration_code,
      status: registration.status,
      version: registration.version,
      submitted_at: submittedAt.toISOString(),
      estimated_sla_days: 2,
    };
  }
}

export const enterpriseRegistrationsService = new EnterpriseRegistrationsService();

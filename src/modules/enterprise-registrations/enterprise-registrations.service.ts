import { createHash, randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { TIME_MS } from '../../shared/constants/time.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { sendEnterpriseRegistrationMagicLink } from '../../shared/services/email.service.js';
import { enterprisesRepository, type EnterprisesRepository } from '../enterprises/enterprises.repository.js';
import { usersRepository, type UsersRepository } from '../users/users.repository.js';
import {
  BLOCKED_EMAIL_DOMAINS,
  REGISTRATION_CONFIG,
  REGISTRATION_MESSAGES,
} from './enterprise-registrations.constants.js';
import {
  enterpriseRegistrationsRepository,
  type EnterpriseRegistrationsRepository,
} from './enterprise-registrations.repository.js';
import type {
  StartRegistrationDTO,
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

    if (domain && (BLOCKED_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        REGISTRATION_MESSAGES.PERSONAL_EMAIL_REJECTED,
      );
    }

    const existingUser = await this.userRepo.findByEmail(corporateEmail);
    if (existingUser) {
      if (existingUser.role === 'applicant' || existingUser.role === 'user') {
        throw createHttpError(
          HTTP_STATUS.HTTP_409_CONFLICT,
          REGISTRATION_MESSAGES.CANDIDATE_CANNOT_REGISTER,
        );
      }
      if (existingUser.enterprise_id) {
        throw createHttpError(
          HTTP_STATUS.HTTP_409_CONFLICT,
          REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS,
        );
      }
    }

    const existingEnterprise = await this.enterpriseRepo.findByEmail(corporateEmail);
    if (existingEnterprise) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS,
      );
    }

    const hasPending = await this.repository.hasPendingRegistrationByEmail(corporateEmail);
    if (hasPending) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        REGISTRATION_MESSAGES.EMAIL_ALREADY_EXISTS,
      );
    }

    const rawToken = randomBytes(REGISTRATION_CONFIG.TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + REGISTRATION_CONFIG.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * TIME_MS.ONE_HOUR,
    );

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

    if (!registration) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        REGISTRATION_MESSAGES.TOKEN_INVALID_OR_EXPIRED,
      );
    }

    const expiresAt = registration.verification_token?.expires_at;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        REGISTRATION_MESSAGES.TOKEN_INVALID_OR_EXPIRED,
      );
    }

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
}

export const enterpriseRegistrationsService = new EnterpriseRegistrationsService();

import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type {
  AcceptInvitationDTO,
  AdminDecisionDTO,
  RegistrationIdParam,
  RegistrationListQuery,
  SaveDraftDTO,
  StartRegistrationDTO,
  SubmitRegistrationDTO,
  UploadLegalDocumentBodyDTO,
  VerifyEmailQueryDTO,
} from './enterprise-registrations.schemas.js';
import {
  enterpriseRegistrationsService,
  type EnterpriseRegistrationsService,
} from './enterprise-registrations.service.js';

export class EnterpriseRegistrationsController {
  constructor(
    private readonly service: EnterpriseRegistrationsService = enterpriseRegistrationsService,
  ) {}

  listRegistrations: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated?.query as RegistrationListQuery;
      const result = await this.service.listRegistrations(query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  startRegistration: RequestHandler = async (_req, res, next) => {
    try {
      const body = res.locals.validated?.body as StartRegistrationDTO;
      const result = await this.service.startRegistration(body);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  verifyEmail: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated?.query as VerifyEmailQueryDTO;
      const result = await this.service.verifyEmail(query.token);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getRegistration: RequestHandler = async (_req, res, next) => {
    try {
      const params = res.locals.validated?.params as RegistrationIdParam;
      const result = await this.service.getRegistration(params.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  saveDraft: RequestHandler = async (_req, res, next) => {
    try {
      const params = res.locals.validated?.params as RegistrationIdParam;
      const body = res.locals.validated?.body as SaveDraftDTO;
      const result = await this.service.saveDraft(params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  uploadLegalDocument: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as RegistrationIdParam;
      const body = res.locals.validated?.body as UploadLegalDocumentBodyDTO;
      const result = await this.service.uploadLegalDocument(params.id, req.file, body.document_type);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  submitRegistration: RequestHandler = async (_req, res, next) => {
    try {
      const params = res.locals.validated?.params as RegistrationIdParam;
      const body = res.locals.validated?.body as SubmitRegistrationDTO;
      const result = await this.service.submitRegistration(params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  processAdminDecision: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as RegistrationIdParam;
      const body = res.locals.validated?.body as AdminDecisionDTO;
      const adminId = req.user!.id;
      const result = await this.service.processAdminDecision(params.id, body, adminId);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  acceptInvitation: RequestHandler = async (_req, res, next) => {
    try {
      const body = res.locals.validated?.body as AcceptInvitationDTO;
      const result = await this.service.acceptInvitation(body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const enterpriseRegistrationsController = new EnterpriseRegistrationsController();

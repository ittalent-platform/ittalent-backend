import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type {
  StartRegistrationDTO,
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
}

export const enterpriseRegistrationsController = new EnterpriseRegistrationsController();

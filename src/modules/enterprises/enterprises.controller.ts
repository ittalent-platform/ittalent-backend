import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { enterprisesService, type EnterprisesService } from './enterprises.service.js';
import type { EnterpriseIdParam, EnterpriseListQuery } from './enterprises.schemas.js';

export class EnterprisesController {
  constructor(private readonly service: EnterprisesService = enterprisesService) {}

  listEnterprises: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated?.query as EnterpriseListQuery;
      const result = await this.service.listEnterprises(query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getEnterpriseById: RequestHandler = async (_req, res, next) => {
    try {
      const params = res.locals.validated?.params as EnterpriseIdParam;
      const result = await this.service.getEnterpriseById(params.enterpriseId);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const enterprisesController = new EnterprisesController();
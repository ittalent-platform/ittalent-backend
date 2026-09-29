import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { ENTERPRISE_MESSAGES } from './enterprises.constants.js';
import { enterprisesService, type EnterprisesService } from './enterprises.service.js';
import type {
  CreateEnterpriseDTO,
  EnterpriseIdParam,
  EnterpriseListQuery,
  UpdateEnterpriseDTO,
  UpdateEnterpriseStatusDTO,
} from './enterprises.schemas.js';

export class EnterprisesController {
  constructor(private readonly service: EnterprisesService = enterprisesService) {}

  createEnterprise: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated?.body as CreateEnterpriseDTO;
      const creatorId = req.user!.id;
      const role = req.user!.role;

      const result = await this.service.createEnterprise(body, creatorId, role);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateEnterprise: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as EnterpriseIdParam;
      const body = res.locals.validated?.body as UpdateEnterpriseDTO;
      const actorId = req.user!.id;
      const role = req.user!.role;

      const result = await this.service.updateEnterprise(
        params.enterpriseId,
        body,
        actorId,
        role,
      );
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateEnterpriseStatus: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as EnterpriseIdParam;
      const body = res.locals.validated?.body as UpdateEnterpriseStatusDTO;
      const adminId = req.user!.id;

      const result = await this.service.updateEnterpriseStatus(
        params.enterpriseId,
        body,
        adminId,
      );
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteEnterprise: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as EnterpriseIdParam;
      const adminId = req.user!.id;

      await this.service.deleteEnterprise(params.enterpriseId, adminId);
      res.status(HTTP_STATUS.HTTP_200_OK).json({
        message: ENTERPRISE_MESSAGES.DELETED_SUCCESS,
      });
    } catch (error) {
      next(error);
    }
  };

  listEnterprises: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated?.query as EnterpriseListQuery;
      const role = req.user?.role;

      const result = await this.service.listEnterprises(query, role);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getEnterpriseById: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as EnterpriseIdParam;
      const role = req.user?.role;
      const userId = req.user?.id;

      const result = await this.service.getEnterpriseById(params.enterpriseId, role, userId);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const enterprisesController = new EnterprisesController();
import type { Request, RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { DASHBOARD_MESSAGES } from './dashboard.constants.js';
import type { CompanyDashboardQuery } from './dashboard.schemas.js';
import { dashboardService, type DashboardActor, type DashboardService } from './dashboard.service.js';

export class DashboardController {
  constructor(private readonly service: DashboardService = dashboardService) {}

  // Throws inside the handler's try block, so the 401 reaches the error handler through next().
  private actorOf(req: Request): DashboardActor {
    if (!req.user) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, DASHBOARD_MESSAGES.AUTH_REQUIRED);
    }
    return { id: req.user.id, role: req.user.role };
  }

  getCompanyDashboard: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated?.query as CompanyDashboardQuery;
      const result = await this.service.getCompanyDashboard(this.actorOf(req), query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getPlatformOverview: RequestHandler = async (req, res, next) => {
    try {
      const result = await this.service.getPlatformOverview(this.actorOf(req));
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const dashboardController = new DashboardController();

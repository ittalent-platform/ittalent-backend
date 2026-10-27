import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { reportsService, type ReportsService } from './reports.service.js';
import type {
  AdminReportsQuery,
  AdminResolveReportInput,
  CreateReportInput,
  ReporterReportsQuery,
  WithdrawReportInput,
} from './reports.schemas.js';

export class ReportsController {
  constructor(private readonly service: ReportsService = reportsService) {}

  // UC-30: Create a report
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id;
      const input = (res.locals.validated?.body ?? req.body) as CreateReportInput;
      const result = await this.service.createReport(reporterId, input);

      res.status(HTTP_STATUS.HTTP_201_CREATED).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-31: View list report of reporter
  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id;
      const query = (res.locals.validated?.query ?? req.query) as ReporterReportsQuery;
      const result = await this.service.listReporterReports(reporterId, query);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-32: View report detail of reporter
  getMineById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id;
      const id = req.params.id as string;
      const result = await this.service.getReporterReportDetail(reporterId, id);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-33: Withdraw a report
  withdrawMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id;
      const id = req.params.id as string;
      const input = (res.locals.validated?.body ?? req.body) as WithdrawReportInput;
      const result = await this.service.withdrawReport(reporterId, id, input);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        message: result.message,
        data: result.report,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-34: Delete report
  deleteMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id;
      const id = req.params.id as string;
      const result = await this.service.deleteReporterReport(reporterId, id);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-35: Admin view list report of reporter
  listAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (res.locals.validated?.query ?? req.query) as AdminReportsQuery;
      const result = await this.service.listAdminReports(query);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-36: Admin view report detail of reporter
  getAdminById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const result = await this.service.getAdminReportDetail(id);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-36: Admin claim ticket
  claimTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const id = req.params.id as string;
      const result = await this.service.claimTicket(adminId, id);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // UC-36: Admin resolve/reject report
  resolveTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const id = req.params.id as string;
      const input = (res.locals.validated?.body ?? req.body) as AdminResolveReportInput;
      const result = await this.service.resolveTicket(adminId, id, input);

      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        message: result.message,
        data: result.report,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const reportsController = new ReportsController();

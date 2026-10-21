import type { RequestHandler } from 'express';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { PORTFOLIO_LINK_MESSAGES } from './portfolio-links.constants.js';
import { portfolioLinksService, type PortfolioLinksService } from './portfolio-links.service.js';
import { idempotencyKeySchema, type CreatePortfolioLinkInput, type PortfolioLinkListQuery } from './portfolio-links.schemas.js';

export class PortfolioLinksController {
  constructor(private readonly service: PortfolioLinksService = portfolioLinksService) {}

  create: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      const body = res.locals.validated?.body as CreatePortfolioLinkInput;
      const key = idempotencyKeySchema.safeParse(req.get('Idempotency-Key'));
      if (!key.success) throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, PORTFOLIO_LINK_MESSAGES.IDEMPOTENCY_KEY_REQUIRED);
      const result = await this.service.create(req.user.id, body, key.data);
      if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
      res.status(result.replayed ? HTTP_STATUS.HTTP_200_OK : HTTP_STATUS.HTTP_201_CREATED).json(result.item);
    } catch (error) {
      next(error);
    }
  };

  list: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      res.json(await this.service.list(req.user.id, res.locals.validated?.query as PortfolioLinkListQuery));
    } catch (error) {
      next(error);
    }
  };

  remove: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      const { id } = res.locals.validated?.params as { id: string };
      const { expectedVersion } = res.locals.validated?.query as { expectedVersion: number };
      await this.service.delete(req.user.id, id, expectedVersion);
      res.status(HTTP_STATUS.HTTP_204_NO_CONTENT).end();
    } catch (error) {
      next(error);
    }
  };
}

export const portfolioLinksController = new PortfolioLinksController();

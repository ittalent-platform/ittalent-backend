import { Router } from 'express';
import { authenticate, authenticateCurrentUser, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { portfolioLinksController } from './portfolio-links.controller.js';
import { createPortfolioLinkSchema, deletePortfolioLinkQuerySchema, portfolioLinkIdParamSchema, portfolioLinkListQuerySchema, updatePortfolioLinkSchema } from './portfolio-links.schemas.js';
import { PORTFOLIO_LINKS } from './portfolio-links.constants.js';

export const portfolioLinksRouter = Router();

portfolioLinksRouter.post('/me/portfolio-links', authenticate, authenticateCurrentUser, validateBody(createPortfolioLinkSchema), portfolioLinksController.create);
portfolioLinksRouter.get('/me/portfolio-links', authenticate, authenticateCurrentUser, authorize(PORTFOLIO_LINKS.CANDIDATE_ROLE), validateQuery(portfolioLinkListQuerySchema), portfolioLinksController.list);
portfolioLinksRouter.patch('/me/portfolio-links/:id', authenticate, authenticateCurrentUser, validateParams(portfolioLinkIdParamSchema), validateBody(updatePortfolioLinkSchema), portfolioLinksController.update);
portfolioLinksRouter.delete('/me/portfolio-links/:id', authenticate, authenticateCurrentUser, validateParams(portfolioLinkIdParamSchema), validateQuery(deletePortfolioLinkQuerySchema), portfolioLinksController.remove);

import type { RequestHandler } from 'express';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { CERTIFICATE_LINK_MESSAGES } from './certificate-links.constants.js';
import { certificateLinksService, type CertificateLinksService } from './certificate-links.service.js';
import { certificateLinkListQuerySchema, createCertificateLinkSchema, idempotencyKeySchema, type CertificateLinkListQuery, type CreateCertificateLinkInput, type UpdateCertificateLinkInput } from './certificate-links.schemas.js';

export class CertificateLinksController {
  constructor(private readonly service: CertificateLinksService = certificateLinksService) {}

  create: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      const body = createCertificateLinkSchema.parse(res.locals.validated?.body) as CreateCertificateLinkInput;
      const key = idempotencyKeySchema.safeParse(req.get('Idempotency-Key'));
      if (!key.success) throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, CERTIFICATE_LINK_MESSAGES.IDEMPOTENCY_KEY_REQUIRED);
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
      const query = certificateLinkListQuerySchema.parse(res.locals.validated?.query) as CertificateLinkListQuery;
      res.json(await this.service.list(req.user.id, query));
    } catch (error) {
      next(error);
    }
  };

  update: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      const { id } = res.locals.validated?.params as { id: string };
      res.json(await this.service.update(req.user.id, id, res.locals.validated?.body as UpdateCertificateLinkInput));
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

export const certificateLinksController = new CertificateLinksController();

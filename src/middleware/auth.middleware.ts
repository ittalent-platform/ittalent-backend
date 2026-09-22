import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';
import type { AuthenticatedUser } from '../types/express.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication token missing or malformed'));
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtPayload;

    if (!decoded.sub || !decoded.email || !decoded.role) {
      next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Invalid token payload'));
      return;
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    } satisfies AuthenticatedUser;

    next();
  } catch {
    next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Invalid or expired authentication token'));
  }
};

export function authorize(...allowedRoles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Forbidden: insufficient permissions'));
      return;
    }

    next();
  };
}

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User, type UserData } from '../models/user.model.js';

import { env } from '../config/env.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';
import type { AuthenticatedUser } from '../types/express.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  av?: number;
}

export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : typeof req.query?.token === 'string'
      ? req.query.token.trim()
      : undefined;

  if (!token) {
    next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication token missing or malformed', 'AUTHENTICATION_REQUIRED'));
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtPayload;

    if (!decoded.sub || !decoded.email || !decoded.role) {
      next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Invalid token payload', 'INVALID_AUTHENTICATION_TOKEN'));
      return;
    }
    req.user = { id: decoded.sub, email: decoded.email, role: decoded.role, authVersion: decoded.av ?? 0 } satisfies AuthenticatedUser;
    next();
  } catch {
    next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Invalid or expired authentication token', 'INVALID_AUTHENTICATION_TOKEN'));
  }
};

export const authenticateOptional: RequestHandler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtPayload;
    if (decoded.sub && decoded.email && decoded.role) {
      const user = await User.findById(decoded.sub).select('email role status auth_version createdAt').lean().exec();
      if (user?.role && isCurrentSession(user, decoded)) {
        req.user = { id: decoded.sub, email: user.email, role: user.role, authVersion: user.auth_version ?? 0 } satisfies AuthenticatedUser;
      }
    }
  } catch {
    // Ignore invalid/expired token for optional authentication
  }

  next();
};

function isCurrentSession(
  user: Pick<UserData, 'role' | 'status' | 'auth_version' | 'createdAt' | 'verification_started_at'>,
  token: { role: string; av?: number | undefined },
): boolean {
  const windowStart = user.verification_started_at ?? user.createdAt;
  const grace = user.status === 'inactive' && windowStart !== undefined
    && Date.now() - new Date(windowStart).getTime() <= env.EMAIL_VERIFICATION_WINDOW_MS;
  return (user.status === 'active' || grace) && user.role === token.role && (user.auth_version ?? 0) === (token.av ?? 0);
}

function currentAccountStateError(status: UserData['status'], emailVerified: boolean): ReturnType<typeof createHttpError> {
  if (!emailVerified) {
    return createHttpError(
      HTTP_STATUS.HTTP_403_FORBIDDEN,
      'Email verification is required for this operation',
      'EMAIL_NOT_VERIFIED',
    );
  }
  if (status === 'suspended') {
    return createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Account is suspended', 'ACCOUNT_SUSPENDED');
  }
  if (status === 'blocked') {
    return createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Account is blocked', 'ACCOUNT_BLOCKED');
  }
  return createHttpError(
    HTTP_STATUS.HTTP_403_FORBIDDEN,
    'An active account is required for this operation',
    'ACCOUNT_INACTIVE',
  );
}

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

/** Re-check platform-admin authority against current persisted state, not a stale JWT claim. */
export const authorizeCurrentSystemAdmin: RequestHandler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'));
    return;
  }
  try {
    if (req.user.role !== 'admin') {
      next(createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required'));
      return;
    }
    const user = await User.findById(req.user.id).select('role status auth_version').lean().exec();
    if (!user || req.user.role !== user.role || user.status !== 'active' || (user.auth_version ?? 0) !== (req.user.authVersion ?? 0)) {
      next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Account is inactive or the session has been revoked'));
      return;
    }
    if (user.role !== 'admin') {
      next(createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required'));
      return;
    }
    next();
  } catch {
    next(createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, 'Unable to validate the current account state'));
  }
};

/** Validate persisted account state and auth-version before trusting an access token. */
export const authenticateCurrentUser: RequestHandler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'));
    return;
  }
  try {
    const user = await User.findById(req.user.id).select('email role status email_verified auth_version createdAt verification_started_at').lean().exec();
    if (!user || !isCurrentSession(user, { role: req.user.role, av: req.user.authVersion })) {
      next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'The session is no longer current', 'SESSION_REVOKED'));
      return;
    }
    req.user = {
      ...req.user,
      email: user.email,
      role: user.role ?? req.user.role,
      authVersion: user.auth_version ?? 0,
      status: user.status ?? 'inactive',
      emailVerified: user.email_verified === true,
    };
    next();
  } catch {
    next(createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, 'Unable to validate the current account state'));
  }
};

/** Require a persisted verified and active account for security-sensitive self mutations. */
export const requireVerifiedActiveUser: RequestHandler = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required', 'AUTHENTICATION_REQUIRED'));
    return;
  }

  try {
    const user = await User.findById(req.user.id)
      .select('email role status email_verified auth_version')
      .lean()
      .exec();

    if (
      !user
      || user.role !== req.user.role
      || (user.auth_version ?? 0) !== (req.user.authVersion ?? 0)
    ) {
      next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'The session is no longer current', 'SESSION_REVOKED'));
      return;
    }

    if (user.status !== 'active' || user.email_verified !== true) {
      next(currentAccountStateError(user.status, user.email_verified === true));
      return;
    }

    req.user = {
      ...req.user,
      email: user.email,
      role: user.role,
      authVersion: user.auth_version ?? 0,
      status: user.status,
      emailVerified: true,
    };
    next();
  } catch {
    next(createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, 'Unable to validate the current account state'));
  }
};

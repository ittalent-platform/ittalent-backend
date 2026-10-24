import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { HTTP_STATUS } from '../shared/constants/http-status.js';

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11_000;

function getStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === MONGO_DUPLICATE_KEY_ERROR_CODE) {
    return HTTP_STATUS.HTTP_409_CONFLICT;
  }
  if (error instanceof ZodError) {
    return HTTP_STATUS.HTTP_400_BAD_REQUEST;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return HTTP_STATUS.HTTP_400_BAD_REQUEST;
  }

  if (error instanceof mongoose.Error.CastError) {
    return HTTP_STATUS.HTTP_400_BAD_REQUEST;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeStatus = 'statusCode' in error ? (error as { statusCode?: unknown }).statusCode : undefined;
    if (typeof maybeStatus === 'number' && maybeStatus >= HTTP_STATUS.HTTP_400_BAD_REQUEST) {
      return maybeStatus;
    }

    const maybeStatusCode = 'status' in error ? (error as { status?: unknown }).status : undefined;
    if (typeof maybeStatusCode === 'number' && maybeStatusCode >= HTTP_STATUS.HTTP_400_BAD_REQUEST) {
      return maybeStatusCode;
    }
  }

  return HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR;
}

// Errors raised through createHttpError carry a deliberate, user-facing message.
function hasExplicitStatus(error: unknown): boolean {
  return typeof error === 'object' && error !== null && ('statusCode' in error || 'status' in error);
}

function getMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Request validation failed';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Internal server error';
}

function getErrorCode(error: unknown): string | undefined {
  if (error instanceof ZodError) {
    const field = error.issues[0]?.path[0];
    if (field === 'newPassword') return 'PASSWORD_POLICY_INVALID';
    if (field === 'confirmation') return 'PASSWORD_CONFIRMATION_INVALID';
    return 'VALIDATION_ERROR';
  }
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const maybeCode = 'code' in error ? (error as { code?: unknown }).code : undefined;

  return typeof maybeCode === 'string' ? maybeCode : undefined;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = getStatusCode(error);
  const code = getErrorCode(error);

  // Unhandled failures never leak internal messages; the logged error id lets support find the cause.
  if (statusCode >= HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR && !hasExplicitStatus(error)) {
    const errorId = randomUUID();
    console.error('[error-handler:unhandled]', errorId, error);
    res.status(statusCode).json({ success: false, message: 'Internal server error', errorId });
    return;
  }
  const message = getMessage(error);

  if (error instanceof ZodError) {
    res.status(statusCode).json({
      success: false,
      message,
      ...(code ? { code } : {}),
      issues: error.issues,
    });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    res.status(statusCode).json({
      success: false,
      message,
      issues: Object.values(error.errors).map((item) => item.message),
    });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(statusCode).json({
      success: false,
      message,
      path: error.path,
      value: error.value,
    });
    return;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(code ? { code } : {}),
  });
};

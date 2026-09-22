import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { HTTP_STATUS } from '../shared/constants/http-status.js';

function getStatusCode(error: unknown): number {
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
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const maybeCode = 'code' in error ? (error as { code?: unknown }).code : undefined;

  return typeof maybeCode === 'string' ? maybeCode : undefined;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = getStatusCode(error);
  const message = getMessage(error);
  const code = getErrorCode(error);

  if (error instanceof ZodError) {
    res.status(statusCode).json({
      success: false,
      message,
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

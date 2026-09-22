import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export interface ValidatedRequestData {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

type ValidationSchema = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

function createValidator(
  schema: ZodTypeAny | undefined,
  value: unknown,
  key: keyof ValidatedRequestData,
): Pick<ValidatedRequestData, typeof key> | undefined {
  if (!schema) {
    return undefined;
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    throw result.error;
  }

  return { [key]: result.data } as Pick<ValidatedRequestData, typeof key>;
}

export function validateRequest(schema: ValidationSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated: ValidatedRequestData = { ...(res.locals.validated ?? {}) };

      Object.assign(validated, createValidator(schema.body, req.body, 'body'));
      Object.assign(validated, createValidator(schema.query, req.query, 'query'));
      Object.assign(validated, createValidator(schema.params, req.params, 'params'));

      res.locals.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return validateRequest({ body: schema });
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return validateRequest({ query: schema });
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return validateRequest({ params: schema });
}

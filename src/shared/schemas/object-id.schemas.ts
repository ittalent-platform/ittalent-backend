import { z } from 'zod';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

// Shared 24-hex MongoDB ObjectId validator; `label` is used in the error message.
export function objectIdSchema(label: string): z.ZodString {
  return z.string().regex(OBJECT_ID_REGEX, `Invalid ${label} format`);
}
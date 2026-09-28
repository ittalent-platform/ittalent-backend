import { z } from 'zod';

import { PAGINATION } from '../constants/pagination.js';

// Reusable page/limit fields. Spread into a `z.strictObject` so each module
// can add its own supported query keys while still rejecting unknown ones.
export const paginationQueryShape = {
  page: z.coerce.number().int().min(PAGINATION.DEFAULT_PAGE).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

export const paginationQuerySchema = z.strictObject(paginationQueryShape);

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function paginatedResponseSchema<T extends z.ZodType>(
  itemSchema: T,
): z.ZodObject<{
  items: z.ZodArray<T>;
  page: z.ZodNumber;
  limit: z.ZodNumber;
  total: z.ZodNumber;
  totalPages: z.ZodNumber;
}> {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
}
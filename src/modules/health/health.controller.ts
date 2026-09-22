import type { RequestHandler } from 'express';

import { healthResponseSchema } from './health.schema.js';

export const getHealth: RequestHandler = (_req, res) => {
  const payload = healthResponseSchema.parse({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });

  res.json(payload);
};

import type { ValidatedRequestData } from '../middleware/validate.js';
import type { UserDoc } from '../models/user.model.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }

  interface Locals {
    validated?: ValidatedRequestData;
    user?: UserDoc | null;
  }
}

export {};

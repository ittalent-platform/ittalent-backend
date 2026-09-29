import { v2 as cloudinary } from 'cloudinary';

import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';
import { env } from './env.js';

let configured = false;

export function getCloudinary(): typeof cloudinary {
  if (!configured) {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, 'Document storage is not configured');
    }

    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

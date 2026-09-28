import './openapi/zod.js';

import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';

import { errorHandler } from './middleware/error-handler.js';
import { getAllowedOrigins, isAllowedOrigin } from './config/origins.js';
import { authController, getResetPasswordRedirectUrl } from './modules/auth/index.js';
import { registerRoutes } from './modules/index.js';
import { openApiDocument } from './openapi/document.js';
import { HTTP_STATUS } from './shared/constants/http-status.js';

export const app = express();

const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin(origin, callback): void {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

app.use(express.json());

registerRoutes(app);

app.get('/verify-email', authController.verifyEmail);

app.get('/reset-password', (req, res): void => {
  res.redirect(
    HTTP_STATUS.HTTP_302_FOUND,
    getResetPasswordRedirectUrl(req.url.split('?')[1] ?? ''),
  );
});

app.get('/reset-password/:token', (req, res): void => {
  const query = new URLSearchParams({ token: req.params.token }).toString();
  res.redirect(HTTP_STATUS.HTTP_302_FOUND, getResetPasswordRedirectUrl(query));
});

app.get('/openapi.json', (_req, res): void => {


  res.json(openApiDocument);
});

if (process.env.NODE_ENV !== 'production') {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
}

app.use((req, res): void => {
  res.status(HTTP_STATUS.HTTP_404_NOT_FOUND).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use(errorHandler);

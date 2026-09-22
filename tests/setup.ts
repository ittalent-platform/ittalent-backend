// Global test setup for environment variables needed by config/env
process.env.PORT ??= '3000';
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/express_template_test';
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret-at-least-32-chars-long';
process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
process.env.JWT_REFRESH_EXPIRES_IN ??= '7d';

import '../src/openapi/zod.js';

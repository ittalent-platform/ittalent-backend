// Global test setup for environment variables needed by config/env
process.env.PORT ??= '3000';

// Vitest runs test files in parallel workers, and several integration files wipe whole collections
// (e.g. `User.deleteMany({})`). Give every worker its own database so files cannot delete each other's data;
// files that share a worker run one after another.
function databaseForWorker(uri: string, workerId: string | undefined): string {
  return workerId ? uri.replace(/^(mongodb(?:\+srv)?:\/\/[^/?]+\/)([^?]*)/, (_match, prefix: string, name: string) => `${prefix}${name}_w${workerId}`) : uri;
}

process.env.MONGODB_URI = databaseForWorker(
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ittalent_test',
  process.env.VITEST_POOL_ID,
);
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret-at-least-32-chars-long';
process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
process.env.JWT_REFRESH_EXPIRES_IN ??= '7d';

import '../src/openapi/zod.js';

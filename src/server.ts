import 'dotenv/config';
import './openapi/zod.js';
import { createServer } from 'node:http';

import { connectDatabase, disconnectDatabase } from './config/db.js';
import { disconnectRedis } from './config/redis.js';
import { env } from './config/env.js';
import { startAuthVerificationJob } from './modules/auth/auth.service.js';
import { broadcastNotificationsService } from './modules/broadcast-notifications/broadcast-notifications.service.js';
import { storageReconciliationsService } from './modules/storage-reconciliations/storage-reconciliations.service.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const stopAuthVerificationJob = startAuthVerificationJob();
  const stopBroadcastScheduler = broadcastNotificationsService.startBroadcastScheduler();
  const stopStorageReconciliation = storageReconciliationsService.startJob();

  const { app } = await import('./app.js');

  const server = createServer(app);

  server.listen(env.PORT, (): void => {
    console.info(`Server listening on http://localhost:${env.PORT}`);
    console.info(`SwaggerUI API Document on http://localhost:${env.PORT}/docs`);
  });

  let isShuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    stopAuthVerificationJob();
    stopBroadcastScheduler();
    stopStorageReconciliation();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await disconnectRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});

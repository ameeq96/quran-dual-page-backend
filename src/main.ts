import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { seedAdmin } from './seed/seed-admin';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: ['log', 'error', 'warn', 'debug'],
  });
  const host = process.env.HOST || '0.0.0.0';
  const port = process.env.PORT ? Number(process.env.PORT) : 5050;
  app.enableShutdownHooks();

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${String(reason)}`);
  });

  process.on('uncaughtException', (error) => {
    logger.error(error.message, error.stack);
  });

  logger.log(`Starting app in ${process.env.NODE_ENV || 'development'} mode`);
  logger.log(`Binding server to ${host}:${port}`);
  await seedAdmin(app);
  await app.listen(port, host);
  logger.log(`Admin API listening on ${host}:${port}`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  if (error instanceof Error) {
    logger.error(error.message, error.stack);
  } else {
    logger.error(`Startup failed: ${String(error)}`);
  }
  process.exit(1);
});

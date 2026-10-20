import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './bootstrap';

const LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

async function bootstrap() {
  const level = (process.env.LOG_LEVEL ?? 'log') as (typeof LEVELS)[number];
  const logger = new ConsoleLogger({
    json: process.env.NODE_ENV === 'production',
    logLevels: LEVELS.slice(0, Math.max(1, LEVELS.indexOf(level) + 1)) as never,
  });
  // rawBody is required to verify webhook HMAC signatures over the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true, logger });
  const config = configureApp(app);
  setupSwagger(app, config);
  await app.listen(config.port);
  Logger.log(`Lendbox API listening on :${config.port}/${config.apiPrefix} (${config.env})`, 'Bootstrap');
  if (config.swaggerEnabled) Logger.log(`Swagger UI at /api/docs`, 'Bootstrap');
}

bootstrap().catch((err: Error) => {
  // Config validation errors list variable names only, never values.
  console.error(err.message);
  process.exit(1);
});

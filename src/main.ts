import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './bootstrap';
import type { AppConfig } from './config/configuration';

const LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;

async function createApp(): Promise<{ app: NestExpressApplication; config: AppConfig }> {
  const level = (process.env.LOG_LEVEL ?? 'log') as (typeof LEVELS)[number];
  const logger = new ConsoleLogger({
    json: process.env.NODE_ENV === 'production',
    logLevels: LEVELS.slice(0, Math.max(1, LEVELS.indexOf(level) + 1)) as never,
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, logger });
  const config = configureApp(app);
  setupSwagger(app, config);
  return { app, config };
}

// Serverless (Vercel): export a request handler; the Nest app is created once per warm instance.
let ready: Promise<(req: IncomingMessage, res: ServerResponse) => void> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= createApp()
    .then(async ({ app }) => {
      await app.init();
      return app.getHttpAdapter().getInstance();
    })
    .catch((err: Error) => {
      ready = undefined; // allow a retry on the next request
      // Config validation errors list variable names only, never values.
      console.error(err.message);
      throw err;
    });
  const server = await ready;
  server(req, res);
}

// Long-running server (local, VPS, Docker): listen on a port.
async function bootstrap() {
  const { app, config } = await createApp();
  await app.listen(config.port);
  Logger.log(`Lendbox API listening on :${config.port}/${config.apiPrefix} (${config.env})`, 'Bootstrap');
  if (config.swaggerEnabled) Logger.log(`Swagger UI at /api/docs`, 'Bootstrap');
}

if (!process.env.VERCEL) {
  bootstrap().catch((err: Error) => {
    // Config validation errors list variable names only, never values.
    console.error(err.message);
    process.exit(1);
  });
}

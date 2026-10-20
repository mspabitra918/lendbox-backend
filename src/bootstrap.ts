import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/configuration';

/** Shared HTTP setup for main.ts and the e2e tests, so tests exercise the real pipeline. */
export function configureApp(app: NestExpressApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: config.bodyLimit });
  app.useBodyParser('urlencoded', { limit: config.bodyLimit, extended: false });
  app.use(helmet({ contentSecurityPolicy: config.swaggerEnabled ? false : undefined, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());

  const allowed = new Set([...config.frontend.publicOrigins, ...config.frontend.adminOrigins]);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(config.apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
      validationError: { target: false, value: false }, // never echo submitted values (PII) back
    }),
  );
  app.enableShutdownHooks();
  return config;
}

export function setupSwagger(app: INestApplication, config: AppConfig) {
  if (!config.swaggerEnabled) return;
  const doc = new DocumentBuilder()
    .setTitle('Lendbox API')
    .setVersion('1.0.0')
    .setDescription(
      [
        'Loan application intake, admin review, agreement signing and notifications.',
        '',
        '**Response envelope:** success → `{ success: true, data, meta? }`; error → `{ success: false, error: { statusCode, code, message, details?, path, timestamp, requestId } }`.',
        '',
        '**Authentication:** admin routes require a JWT from `POST /auth/admin/login`, sent as `Authorization: Bearer <token>` or via the HttpOnly cookie set at login. Cookie-authenticated POST/PATCH requests must come from an allowed admin Origin.',
        '',
        '**Statuses:** received → pending_loan_agreement (send-agreement) → loan_agreement_signed (verified signature only) → approved → funded. declined/withdrawn are available to admins from any non-terminal state except approved→declined. Workflow status is not itself a credit decision, contract execution or disbursement.',
        '',
        'All examples use fictitious data.',
      ].join('\n'),
    )
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin-jwt')
    .addCookieAuth(config.auth.cookieName, { type: 'apiKey', in: 'cookie' }, 'admin-cookie')
    .build();
  const document = SwaggerModule.createDocument(app, doc);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json', swaggerOptions: { persistAuthorization: false } });
}

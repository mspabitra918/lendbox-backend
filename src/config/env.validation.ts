import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : String(value).toLowerCase() === 'true';
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

/** Validates process.env on startup; the app refuses to boot on invalid config. */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(toInt) @IsInt() @Min(0) @Max(65535)
  PORT = 4000;

  @IsString() @Matches(/^[a-z0-9/_-]+$/i)
  API_PREFIX = 'api/v1';

  @IsString() @IsNotEmpty()
  FRONTEND_URL: string;

  @IsString() @IsNotEmpty()
  ADMIN_FRONTEND_URL: string;

  @IsOptional() @IsString()
  ADMIN_APPLICATION_PATH = '/admin/applications';

  @IsOptional() @IsString()
  SIGNING_PAGE_PATH = '/borrower/agreement/sign';

  @Transform(toInt) @IsInt() @Min(0)
  TRUST_PROXY = 0;

  @IsOptional() @IsString()
  BODY_LIMIT = '100kb';

  @Transform(toBool) @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsIn(['error', 'warn', 'log', 'debug', 'verbose'])
  LOG_LEVEL: 'error' | 'warn' | 'log' | 'debug' | 'verbose' = 'log';

  // Database
  @IsString() @IsNotEmpty() DB_HOST: string;
  @Transform(toInt) @IsInt() DB_PORT = 5432;
  @IsString() @IsNotEmpty() DB_NAME: string;
  @IsString() @IsNotEmpty() DB_USER: string;
  @IsOptional() @IsString() DB_PASSWORD = '';
  @Transform(toBool) @IsBoolean() DB_SSL = false;
  @Transform(toBool) @IsBoolean() DB_SSL_REJECT_UNAUTHORIZED = true;
  @Transform(toInt) @IsInt() @Min(1) DB_POOL_MAX = 10;

  // Crypto
  @IsString() @Matches(/^[A-Za-z0-9+/]{43}=$/, { message: 'FIELD_ENCRYPTION_KEY must be 32 bytes base64-encoded' })
  FIELD_ENCRYPTION_KEY: string;

  @IsString() @MinLength(32)
  FINGERPRINT_SECRET: string;

  @Transform(toInt) @IsInt() @Min(0)
  DUPLICATE_SUBMISSION_WINDOW_MINUTES = 15;

  // Auth
  @IsString() @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString() @Matches(/^\d+[smhd]$/, { message: 'JWT_ACCESS_EXPIRES_IN must look like 15m, 1h, 1d' })
  JWT_ACCESS_EXPIRES_IN = '30m';

  @IsString() JWT_ISSUER = 'lendbox-api';
  @IsString() JWT_AUDIENCE = 'lendbox-admin';
  @IsString() @Matches(/^[a-z0-9_-]+$/i) AUTH_COOKIE_NAME = 'lendbox_admin';
  @Transform(toBool) @IsBoolean() AUTH_COOKIE_SECURE = false;
  @Transform(toInt) @IsInt() @Min(4) @Max(15) BCRYPT_ROUNDS = 12;
  @Transform(toInt) @IsInt() @Min(1) LOGIN_RATE_LIMIT = 5;
  @Transform(toInt) @IsInt() @Min(1) LOGIN_RATE_TTL_SECONDS = 60;
  @Transform(toInt) @IsInt() @Min(1) RATE_LIMIT = 100;
  @Transform(toInt) @IsInt() @Min(1) RATE_LIMIT_TTL_SECONDS = 60;
  @Transform(toInt) @IsInt() @Min(1) STRICT_RATE_LIMIT = 10;

  // Mail
  @IsIn(['smtp', 'json']) MAIL_TRANSPORT: 'smtp' | 'json' = 'smtp';
  @ValidateIf((o: EnvironmentVariables) => o.MAIL_TRANSPORT === 'smtp') @IsString() @IsNotEmpty() SMTP_HOST: string;
  @Transform(toInt) @IsInt() SMTP_PORT = 587;
  @Transform(toBool) @IsBoolean() SMTP_SECURE = false;
  @IsOptional() @IsString() SMTP_USER = '';
  @IsOptional() @IsString() SMTP_PASSWORD = '';
  @IsString() @IsNotEmpty() SMTP_FROM: string;
  @IsEmail() ADMIN_NOTIFICATION_EMAIL: string;
  @IsEmail() SUPPORT_EMAIL: string;
  @IsOptional() @IsString() SUPPORT_PHONE = '';
  @Transform(toBool) @IsBoolean() EMAIL_WORKER_ENABLED = true;
  @Transform(toInt) @IsInt() @Min(1000) EMAIL_WORKER_INTERVAL_MS = 15000;
  @Transform(toInt) @IsInt() @Min(1) @Max(20) EMAIL_MAX_ATTEMPTS = 5;

  // E-signature
  @IsIn(['internal', 'docusign']) ESIGN_PROVIDER: 'internal' | 'docusign' = 'internal';
  @Transform(toInt) @IsInt() @Min(1) @Max(720) SIGNING_LINK_EXPIRES_HOURS = 72;
  @Transform(toInt) @IsInt() @Min(1) @Max(20) SIGNING_MAX_VERIFICATION_ATTEMPTS = 5;
  @IsString() AGREEMENT_TEMPLATE_VERSION = 'v0-draft';

  @IsOptional() @IsString() DOCUSIGN_BASE_PATH = 'https://demo.docusign.net/restapi';
  @IsOptional() @IsString() DOCUSIGN_OAUTH_BASE = 'account-d.docusign.com';
  @ValidateIf((o: EnvironmentVariables) => o.ESIGN_PROVIDER === 'docusign') @IsString() @IsNotEmpty() DOCUSIGN_ACCOUNT_ID: string;
  @ValidateIf((o: EnvironmentVariables) => o.ESIGN_PROVIDER === 'docusign') @IsString() @IsNotEmpty() DOCUSIGN_INTEGRATION_KEY: string;
  @ValidateIf((o: EnvironmentVariables) => o.ESIGN_PROVIDER === 'docusign') @IsString() @IsNotEmpty() DOCUSIGN_USER_ID: string;
  @ValidateIf((o: EnvironmentVariables) => o.ESIGN_PROVIDER === 'docusign') @IsString() @IsNotEmpty() DOCUSIGN_PRIVATE_KEY_BASE64: string;
  @ValidateIf((o: EnvironmentVariables) => o.ESIGN_PROVIDER === 'docusign') @IsString() @MinLength(16) DOCUSIGN_WEBHOOK_SECRET: string;
  @IsOptional() @IsString() DOCUSIGN_RETURN_URL = '';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    // Only names and constraint messages are printed, never values.
    const details = errors.map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`);
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }
  if (env.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (!env.AUTH_COOKIE_SECURE) problems.push('AUTH_COOKIE_SECURE must be true in production');
    if (env.MAIL_TRANSPORT !== 'smtp') problems.push('MAIL_TRANSPORT must be smtp in production');
    if (env.BCRYPT_ROUNDS < 12) problems.push('BCRYPT_ROUNDS must be >= 12 in production');
    if (/REPLACE|change-me/i.test(env.JWT_ACCESS_SECRET + env.FINGERPRINT_SECRET)) problems.push('placeholder secrets detected');
    if (problems.length) throw new Error(`Unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return env;
}

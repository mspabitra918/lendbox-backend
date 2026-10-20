import { EnvironmentVariables } from './env.validation';

const splitOrigins = (v: string) =>
  v.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

export const buildConfig = (env: EnvironmentVariables) => ({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  apiPrefix: env.API_PREFIX,
  trustProxy: env.TRUST_PROXY,
  bodyLimit: env.BODY_LIMIT,
  swaggerEnabled: env.SWAGGER_ENABLED,
  logLevel: env.LOG_LEVEL,
  frontend: {
    publicOrigins: splitOrigins(env.FRONTEND_URL),
    adminOrigins: splitOrigins(env.ADMIN_FRONTEND_URL),
    publicUrl: splitOrigins(env.FRONTEND_URL)[0],
    adminUrl: splitOrigins(env.ADMIN_FRONTEND_URL)[0],
    adminApplicationPath: env.ADMIN_APPLICATION_PATH,
    signingPagePath: env.SIGNING_PAGE_PATH,
  },
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL,
    sslRejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
    poolMax: env.DB_POOL_MAX,
  },
  crypto: {
    fieldEncryptionKey: env.FIELD_ENCRYPTION_KEY,
    fingerprintSecret: env.FINGERPRINT_SECRET,
    duplicateWindowMinutes: env.DUPLICATE_SUBMISSION_WINDOW_MINUTES,
  },
  auth: {
    jwtSecret: env.JWT_ACCESS_SECRET,
    jwtExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
    cookieName: env.AUTH_COOKIE_NAME,
    cookieSecure: env.AUTH_COOKIE_SECURE,
    bcryptRounds: env.BCRYPT_ROUNDS,
    loginRateLimit: env.LOGIN_RATE_LIMIT,
    loginRateTtlMs: env.LOGIN_RATE_TTL_SECONDS * 1000,
  },
  rateLimit: { limit: env.RATE_LIMIT, ttlMs: env.RATE_LIMIT_TTL_SECONDS * 1000, strictLimit: env.STRICT_RATE_LIMIT },
  mail: {
    transport: env.MAIL_TRANSPORT,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
    adminNotificationEmail: env.ADMIN_NOTIFICATION_EMAIL,
    supportEmail: env.SUPPORT_EMAIL,
    supportPhone: env.SUPPORT_PHONE,
    workerEnabled: env.EMAIL_WORKER_ENABLED,
    workerIntervalMs: env.EMAIL_WORKER_INTERVAL_MS,
    maxAttempts: env.EMAIL_MAX_ATTEMPTS,
  },
  esign: {
    provider: env.ESIGN_PROVIDER,
    linkExpiresHours: env.SIGNING_LINK_EXPIRES_HOURS,
    maxVerificationAttempts: env.SIGNING_MAX_VERIFICATION_ATTEMPTS,
    templateVersion: env.AGREEMENT_TEMPLATE_VERSION,
    docusign: {
      basePath: env.DOCUSIGN_BASE_PATH,
      oauthBase: env.DOCUSIGN_OAUTH_BASE,
      accountId: env.DOCUSIGN_ACCOUNT_ID,
      integrationKey: env.DOCUSIGN_INTEGRATION_KEY,
      userId: env.DOCUSIGN_USER_ID,
      privateKeyBase64: env.DOCUSIGN_PRIVATE_KEY_BASE64,
      webhookSecret: env.DOCUSIGN_WEBHOOK_SECRET,
      returnUrl: env.DOCUSIGN_RETURN_URL,
    },
  },
});

export type AppConfig = ReturnType<typeof buildConfig>;

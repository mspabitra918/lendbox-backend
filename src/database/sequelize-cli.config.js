/* eslint-disable */
// Connection settings for sequelize-cli (migrations + seeders). Reads the same
// environment variables as the application so there is a single source of truth.
const path = require('path');
const env = process.env.NODE_ENV || 'development';
require('dotenv').config({
  path: path.resolve(process.cwd(), '.env'),
  quiet: true,
});

// DATABASE_URL (e.g. Neon) wins over the individual DB_* variables, as in the app.
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const ssl =
  String(process.env.DB_SSL).toLowerCase() === 'true' ||
  ['require', 'verify-ca', 'verify-full'].includes(url?.searchParams.get('sslmode') ?? '');
const base = {
  username: url ? decodeURIComponent(url.username) : process.env.DB_USER,
  password: (url ? decodeURIComponent(url.password) : process.env.DB_PASSWORD) || null,
  database: url ? decodeURIComponent(url.pathname.slice(1)) : process.env.DB_NAME,
  host: url ? url.hostname : process.env.DB_HOST || 'localhost',
  port: Number((url && url.port) || process.env.DB_PORT || 5432),
  dialect: 'postgres',
  logging: false,
  migrationStorageTableName: 'sequelize_meta',
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_data',
  dialectOptions: ssl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'true') !== 'false',
        },
      }
    : {},
};

module.exports = { development: base, test: base, production: base };

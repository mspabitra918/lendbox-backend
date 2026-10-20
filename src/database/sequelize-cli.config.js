/* eslint-disable */
// Connection settings for sequelize-cli (migrations + seeders). Reads the same
// environment variables as the application so there is a single source of truth.
const path = require('path');
const env = process.env.NODE_ENV || 'development';
require('dotenv').config({
  path: process.env.DOTENV_PATH || path.resolve(process.cwd(), env === 'test' ? '.env.test' : '.env'),
  quiet: true,
});

const ssl = String(process.env.DB_SSL).toLowerCase() === 'true';
const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD || null,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
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

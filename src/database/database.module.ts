import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { MODELS } from './models';

// Static require so serverless bundlers (Vercel) include `pg`; Sequelize otherwise loads it dynamically.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg: object = require('pg');

/**
 * Schema is managed exclusively by Sequelize migrations (src/database/migrations).
 * `synchronize` is false: the app never creates or alters tables.
 */
@Global()
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        dialect: 'postgres' as const,
        dialectModule: pg,
        host: config.db.host,
        port: config.db.port,
        database: config.db.name,
        username: config.db.user,
        password: config.db.password,
        models: MODELS,
        autoLoadModels: false,
        synchronize: false,
        logging: false,
        pool: { max: config.db.poolMax, min: 0, idle: 10000, acquire: 30000 },
        dialectOptions: config.db.ssl
          ? { ssl: { require: true, rejectUnauthorized: config.db.sslRejectUnauthorized } }
          : {},
        define: { underscored: true },
      }),
    }),
    SequelizeModule.forFeature(MODELS),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}

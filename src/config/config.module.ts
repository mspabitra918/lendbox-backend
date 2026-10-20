import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { buildConfig } from './configuration';
import { validateEnv } from './env.validation';

export const APP_CONFIG = Symbol('APP_CONFIG');

const envFile = process.env.DOTENV_PATH
  ?? path.resolve(process.cwd(), process.env.NODE_ENV === 'test' ? '.env.test' : '.env');

@Global()
@Module({
  imports: [ConfigModule.forRoot({ envFilePath: envFile, validate: validateEnv, cache: true })],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => buildConfig(validateEnv(process.env as Record<string, unknown>)),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}

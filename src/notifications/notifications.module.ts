import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { createMailTransport, MAIL_TRANSPORT } from './mail-transport';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [
    { provide: MAIL_TRANSPORT, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createMailTransport(c) },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}

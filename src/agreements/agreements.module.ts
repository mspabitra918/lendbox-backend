import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { ApplicationsModule } from '../applications/applications.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAgreementsController } from './admin-agreements.controller';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';
import { DocusignApiClient } from './providers/docusign-api.client';
import { DocusignProvider } from './providers/docusign.provider';
import { ESIGN_PROVIDERS, ESignatureProvider } from './providers/esign-provider.interface';
import { InternalSigningProvider } from './providers/internal.provider';

@Module({
  imports: [AuthModule, ApplicationsModule],
  controllers: [AgreementsController, AdminAgreementsController],
  providers: [
    AgreementsService,
    InternalSigningProvider,
    DocusignApiClient,
    DocusignProvider,
    {
      // Registry of available providers. `internal` is always available; DocuSign is
      // registered when either its API credentials or its webhook secret are set.
      provide: ESIGN_PROVIDERS,
      inject: [APP_CONFIG, InternalSigningProvider, DocusignProvider, DocusignApiClient],
      useFactory: (config: AppConfig, internal: InternalSigningProvider, docusign: DocusignProvider, api: DocusignApiClient) => {
        const map = new Map<string, ESignatureProvider>([[internal.name, internal]]);
        if (api.isConfigured || config.esign.docusign.webhookSecret) map.set(docusign.name, docusign);
        return map;
      },
    },
  ],
})
export class AgreementsModule {}

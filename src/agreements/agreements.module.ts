import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAgreementsController } from './admin-agreements.controller';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

@Module({
  imports: [AuthModule, ApplicationsModule],
  controllers: [AgreementsController, AdminAgreementsController],
  providers: [AgreementsService],
})
export class AgreementsModule {}

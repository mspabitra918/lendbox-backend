import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';

/** No HTTP controller: there is intentionally no admin registration endpoint. Use the CLI or seeder. */
@Module({ providers: [AdminsService], exports: [AdminsService] })
export class AdminsModule {}

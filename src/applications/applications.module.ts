import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminApplicationsController } from "./admin-applications.controller";
import { AdminApplicationsService } from "./admin-applications.service";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { StatusTransitionService } from "./status-transition.service";
import { WithdrawController } from "./withdraw.controller";
import { WithdrawService } from "./withdraw.service";

@Module({
  imports: [AuthModule],
  controllers: [
    ApplicationsController,
    AdminApplicationsController,
    AdminDashboardController,
    WithdrawController,
  ],
  providers: [
    ApplicationsService,
    AdminApplicationsService,
    StatusTransitionService,
    WithdrawService,
  ],
  exports: [StatusTransitionService],
})
export class ApplicationsModule {}

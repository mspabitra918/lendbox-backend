import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";

import { Application } from "./models/application.model";
import { ApplicationStatus } from "./application-status";

@Injectable()
export class WithdrawService {
  constructor(
    @InjectModel(Application)
    private readonly applicationModel: typeof Application,
  ) {}

  async withdrawApplication(
    applicationId: string,
  ): Promise<{ message: string; id: string; status: ApplicationStatus }> {
    const application = await this.applicationModel.findByPk(applicationId);

    if (!application) {
      throw new NotFoundException("Application not found");
    }

    if (application.status === ApplicationStatus.WITHDRAWN) {
      throw new ConflictException("Application is already withdrawn");
    }

    if (
      application.status === ApplicationStatus.FUNDED ||
      application.status === ApplicationStatus.DECLINED
    ) {
      throw new ConflictException(
        `Cannot withdraw an application with status "${application.status}"`,
      );
    }

    const eligibleStatuses: ApplicationStatus[] = [
      ApplicationStatus.RECEIVED,
      ApplicationStatus.PENDING_LOAN_AGREEMENT,
      ApplicationStatus.LOAN_AGREEMENT_SIGNED,
      ApplicationStatus.APPROVED,
    ];

    if (!eligibleStatuses.includes(application.status)) {
      throw new BadRequestException(
        `Cannot withdraw application with status "${application.status}"`,
      );
    }

    application.status = ApplicationStatus.WITHDRAWN;
    await application.save();

    return {
      message: "Application withdrawn successfully",
      id: application.id,
      status: application.status,
    };
  }
}

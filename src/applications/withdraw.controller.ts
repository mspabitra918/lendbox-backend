import { Body, Controller, Post } from "@nestjs/common";
import { WithdrawService } from "./withdraw.service";

@Controller("withdraw")
export class WithdrawController {
  constructor(private readonly withdrawService: WithdrawService) {}

  @Post("withdraw-application")
  async withdrawApplication(@Body("applicationId") applicationId: string) {
    return this.withdrawService.withdrawApplication(applicationId);
  }
}

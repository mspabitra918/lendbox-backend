import { IsEmail } from "class-validator";

export class WithdrawApplicationDto {
  @IsEmail()
  email: string;
}

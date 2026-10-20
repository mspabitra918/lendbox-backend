import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  Equals,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  ACCOUNT_AGES,
  ACCOUNT_TYPES,
  BALANCE_BANDS,
  EMPLOYED_STATUSES,
  EMPLOYMENT_STATUSES,
  HOUSING_STATUSES,
  INCOME_SOURCES,
  LOAN_MAX,
  LOAN_MIN,
  PAY_FREQUENCIES,
  PURPOSES,
  US_STATES,
} from "../application-options";
import {
  IsAdultDateOfBirth,
  IsRoutingNumber,
  IsSsn,
  IsUpcomingDate,
  MatchesProperty,
} from "../../common/validators/custom.validators";
import {
  DigitsOnly,
  LowerCaseTrim,
  SanitizeText,
  UpperCaseTrim,
} from "../../common/validators/sanitize";

const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u;
const isEmployed = (o: { employmentStatus?: string }) =>
  (EMPLOYED_STATUSES as readonly string[]).includes(o.employmentStatus ?? "");

/*
 * Field names and types match ApplicationFormData in
 * lendbox-frontend/src/types/application.ts exactly. Unknown fields are
 * rejected (forbidNonWhitelisted) to prevent mass assignment.
 */

export class LoanDto {
  @ApiProperty({ example: 5000, minimum: LOAN_MIN, maximum: LOAN_MAX })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(LOAN_MIN)
  @Max(LOAN_MAX)
  amount: number;

  @ApiProperty({ enum: PURPOSES, example: "debt_consolidation" })
  @IsIn(PURPOSES)
  purpose: string;

  @ApiProperty({
    example: "",
    description:
      'Required (non-empty) when purpose is "other"; ignored otherwise.',
  })
  @SanitizeText()
  @IsString()
  @MaxLength(200)
  @ValidateIf((o: LoanDto) => o.purpose === "other")
  @IsNotEmpty()
  otherPurpose: string;
}

export class PersonalDto {
  @ApiProperty({ example: "Jane" })
  @SanitizeText()
  @IsString()
  @Length(1, 100)
  @Matches(NAME, { message: "firstName contains invalid characters" })
  firstName: string;

  @ApiProperty({ example: "Doe" })
  @SanitizeText()
  @IsString()
  @Length(1, 100)
  @Matches(NAME, { message: "lastName contains invalid characters" })
  lastName: string;

  @ApiProperty({ example: "jane.doe@example.com" })
  @LowerCaseTrim()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: "(555) 123-4567",
    description: "Formatted or raw; stored as 10 digits.",
  })
  @DigitsOnly()
  @IsString()
  @Matches(/^\d{10}$/, { message: "phone must be a 10-digit phone number" })
  phone: string;

  @ApiProperty({ example: "04", description: "01-12" })
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])$/)
  dobMonth: string;

  @ApiProperty({ example: "15", description: "01-31" })
  @IsString()
  @Matches(/^(0[1-9]|[12]\d|3[01])$/)
  dobDay: string;

  @ApiProperty({ example: "1988" })
  @IsString()
  @Matches(/^\d{4}$/)
  @IsAdultDateOfBirth()
  dobYear: string;

  @ApiProperty({
    example: "123-45-6789",
    description:
      "Formatted or raw. Encrypted at rest; only last 4 are ever displayed.",
  })
  @DigitsOnly()
  @IsString()
  @IsSsn()
  ssn: string;

  @ApiProperty({ example: "D1234567" })
  @UpperCaseTrim()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9 *-]{0,24}$/, { message: "dlNumber is invalid" })
  dlNumber: string;

  @ApiProperty({ enum: US_STATES, example: "CA" })
  @IsIn(US_STATES)
  dlState: string;

  @ApiProperty({ example: "123 Example Street" })
  @SanitizeText()
  @IsString()
  @Length(1, 200)
  streetAddress: string;

  @ApiProperty({ example: "Apt 4B" })
  @SanitizeText()
  @IsString()
  @MaxLength(200)
  addressLine2: string;

  @ApiProperty({ example: "Springfield" })
  @SanitizeText()
  @IsString()
  @Length(1, 100)
  city: string;

  @ApiProperty({ enum: US_STATES, example: "CA" })
  @IsIn(US_STATES)
  state: string;

  @ApiProperty({ example: "90210" })
  @IsString()
  @Matches(/^\d{5}$/, { message: "zip must be a 5-digit ZIP" })
  zip: string;

  @ApiProperty({ example: 3 })
  @IsNumber({ maxDecimalPlaces: 1, allowNaN: false })
  @Min(0)
  @Max(100)
  yearsAtAddress: number;

  @ApiProperty({ enum: HOUSING_STATUSES, example: "rent" })
  @IsIn(HOUSING_STATUSES)
  housingStatus: string;

  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false })
  @Min(0)
  @Max(1_000_000)
  monthlyHousingCost: number;
}

export class EmploymentDto {
  @ApiProperty({ enum: EMPLOYMENT_STATUSES, example: "full_time" })
  @IsIn(EMPLOYMENT_STATUSES)
  employmentStatus: string;

  @ApiProperty({
    example: "Example Corp",
    description: "Required when employed/self-employed.",
  })
  @SanitizeText()
  @IsString()
  @MaxLength(200)
  @ValidateIf(isEmployed)
  @IsNotEmpty()
  employerName: string;

  @ApiProperty({
    example: "Analyst",
    description: "Required when employed/self-employed.",
  })
  @SanitizeText()
  @IsString()
  @MaxLength(120)
  @ValidateIf(isEmployed)
  @IsNotEmpty()
  jobTitle: string;

  @ApiProperty({
    example: 24,
    description: "Months with employer; ≥ 1 when employed.",
  })
  @IsInt()
  @Min(0)
  @Max(1200)
  @ValidateIf(isEmployed)
  @Min(1)
  employmentLengthMo: number;

  @ApiProperty({
    example: "(555) 987-6543",
    description: "10 digits when employed; may be empty otherwise.",
  })
  @DigitsOnly()
  @IsString()
  @ValidateIf((o: EmploymentDto) => isEmployed(o) || o.employerPhone !== "")
  @Matches(/^\d{10}$/, {
    message: "employerPhone must be a 10-digit phone number",
  })
  employerPhone: string;

  @ApiProperty({ enum: PAY_FREQUENCIES, example: "bi_weekly" })
  @IsIn(PAY_FREQUENCIES)
  payFrequency: string;

  @ApiProperty({
    example: "2026-10-31",
    description: "YYYY-MM-DD, today or later",
  })
  @IsString()
  @IsUpcomingDate()
  nextPayDate: string;

  @ApiProperty({
    example: "4200.00",
    description: "String, as sent by the frontend. Must be > 0.",
  })
  @Transform(({ value }) => (typeof value === "number" ? String(value) : value))
  @IsString()
  @Matches(/^(?!0+(\.0+)?$)\d{1,9}(\.\d{1,2})?$/, {
    message: "netMonthlyIncome must be a positive amount",
  })
  netMonthlyIncome: string;

  @ApiProperty({ enum: INCOME_SOURCES, example: "employment" })
  @IsIn(INCOME_SOURCES)
  incomeSource: string;
}

export class BankingDto {
  @ApiProperty({ example: "Example Bank" })
  @SanitizeText()
  @IsString()
  @Length(1, 200)
  bankName: string;

  @ApiProperty({ enum: ACCOUNT_TYPES, example: "checking" })
  @IsIn(ACCOUNT_TYPES)
  accountType: string;

  @ApiProperty({
    example: "011000015",
    description: "9 digits, ABA checksum. Encrypted at rest.",
  })
  @DigitsOnly()
  @IsString()
  @IsRoutingNumber()
  routingNumber: string;

  @ApiProperty({
    example: "jane_doe_online",
    description: "Encrypted at rest.",
  })
  @IsString()
  @Length(1, 200)
  bankUsername: string;

  @ApiProperty({
    example: "not-a-real-password",
    format: "password",
    description:
      "Validated for presence only. NEVER stored, logged or returned. See README security notes.",
  })
  @IsString()
  @Length(1, 200)
  bankPassword: string;

  @ApiProperty({
    example: "000123456789",
    description: "4-17 digits. Encrypted at rest; only last 4 displayed.",
  })
  @DigitsOnly()
  @IsString()
  @Matches(/^\d{4,17}$/, { message: "accountNumber must be 4-17 digits" })
  accountNumber: string;

  @ApiProperty({
    example: "000123456789",
    description: "Must equal accountNumber. Not stored.",
  })
  @DigitsOnly()
  @IsString()
  @MatchesProperty("accountNumber", { message: "Account numbers don't match" })
  confirmAccountNumber: string;

  @ApiProperty({ enum: ACCOUNT_AGES, example: "1_2_years" })
  @IsIn(ACCOUNT_AGES)
  accountAge: string;

  @ApiProperty({ enum: BALANCE_BANDS, example: "_1_000_5_000" })
  @IsIn(BALANCE_BANDS)
  currentBalanceBand: string;

  @ApiProperty({
    example: true,
    type: Boolean,
    description: "The form starts as null; a boolean is required to submit.",
  })
  @IsDefined({ message: "directDeposit: please choose one" })
  @IsBoolean()
  directDeposit: boolean;
}

export class ConsentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: "esign consent is required" })
  esign: boolean;
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: "privacy consent is required" })
  privacy: boolean;
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: "creditPull consent is required" })
  creditPull: boolean;
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true, { message: "tcpa consent is required" })
  tcpa: boolean;
}

export class CreateApplicationDto {
  @ApiProperty({ type: LoanDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => LoanDto)
  loan: LoanDto;

  @ApiProperty({ type: PersonalDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PersonalDto)
  personal: PersonalDto;

  @ApiProperty({ type: EmploymentDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => EmploymentDto)
  employment: EmploymentDto;

  @ApiProperty({ type: BankingDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => BankingDto)
  banking: BankingDto;

  @ApiProperty({ type: ConsentDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ConsentDto)
  consent: ConsentDto;
}

export class ApplicationSubmittedDto {
  @ApiProperty({
    example: "56T65T",
    description:
      "Application id: 6 uppercase letters/digits, generated by the server",
  })
  applicationId: string;
  @ApiProperty({
    example: "LB-7K3M9QX2",
    description: "Public reference shown to the applicant",
  })
  reference: string;
  @ApiProperty({ example: "received" }) status: string;
  @ApiProperty({ example: "2026-10-17T10:15:00.000Z" }) submittedAt: string;
  @ApiProperty({
    example: false,
    description:
      "true when this request matched an earlier submission and nothing new was created",
  })
  duplicate: boolean;
  @ApiProperty({
    example: "queued",
    enum: ["queued", "sending", "sent", "failed"],
    description: 'Confirmation email state. "queued" is not "delivered".',
  })
  confirmationEmail: string;
  @ApiProperty({
    example:
      "Your application has been received. A confirmation email is on its way.",
  })
  message: string;
}

export class StatusLookupDto {
  @ApiProperty({ example: "7NY1FD" })
  @UpperCaseTrim()
  @IsString()
  // @Matches(/^LB-[0-9A-Z]{8}$/, { message: "reference is invalid" })
  applicationId: string;

  @ApiProperty({ example: "jane.doe@example.com" })
  @LowerCaseTrim()
  @IsEmail()
  @MaxLength(254)
  email: string;
}

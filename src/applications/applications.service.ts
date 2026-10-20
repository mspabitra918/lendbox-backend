import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/sequelize";
import { Op, Transaction, UniqueConstraintError } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/configuration";
import { AuditService } from "../audit/audit.service";
import { FieldEncryptionService } from "../common/crypto/field-encryption.service";
import {
  generateApplicationId,
  generateApplicationReference,
  hmacSha256Hex,
} from "../common/crypto/tokens";
import { lastFour, maskEmail } from "../common/utils/mask";
import type { RequestContext } from "../common/utils/request-context";
import { NotificationsService } from "../notifications/notifications.service";
import { EMPLOYED_STATUSES } from "./application-options";
import { ApplicationStatus, TransitionActor } from "./application-status";
import { toPublicStatus } from "./application.mapper";
import {
  ApplicationSubmittedDto,
  CreateApplicationDto,
} from "./dto/create-application.dto";
import { ApplicationStatusHistory } from "./models/application-status-history.model";
import { Application } from "./models/application.model";

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const MAX_REFERENCE_ATTEMPTS = 5;

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(Application) private readonly applications: typeof Application,
    @InjectModel(ApplicationStatusHistory)
    private readonly history: typeof ApplicationStatusHistory,
    private readonly crypto: FieldEncryptionService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findByApplicationId(applicationId: string) {
    const app = await this.applications.findOne({
      where: { id: applicationId },
    });

    if (!app) {
      return null;
    }

    return {
      status: app.status === "received" ? "submitted" : app.status,

      applicant: {
        firstName: app.firstName ?? "",
        lastName: app.lastName ?? "",
        email: app.email,
      },

      // The ID used by your existing thank-you page.
      id: app.id,

      loan: {
        amount: Number(app.loanAmount),
        purpose: app.loanPurpose,
        otherPurpose: app.loanOtherPurpose ?? "",
      },
    };
  }

  /**
   * Persists a new application with status `received`, its first history row,
   * an audit entry and two queued emails — all in one transaction. Email
   * delivery happens afterwards, so an SMTP outage can never lose or roll back
   * a saved application.
   *
   * Duplicate protection: (1) an optional Idempotency-Key header, and (2) a keyed
   * fingerprint of email+SSN+amount+purpose within a configurable window. A
   * per-fingerprint advisory lock serialises concurrent double-clicks.
   */
  async submit(
    dto: CreateApplicationDto,
    ctx: RequestContext,
    idempotencyKey?: string,
  ): Promise<ApplicationSubmittedDto> {
    const fingerprint = hmacSha256Hex(
      this.config.crypto.fingerprintSecret,
      [
        dto.personal.email,
        dto.personal.ssn,
        dto.loan.amount.toFixed(2),
        dto.loan.purpose,
      ].join("|"),
    );

    for (let attempt = 1; ; attempt++) {
      try {
        const result = await this.sequelize.transaction(async (t) => {
          await this.sequelize.query(
            "SELECT pg_advisory_xact_lock(hashtext(:fp))",
            { replacements: { fp: fingerprint }, transaction: t },
          );
          const existing = await this.findDuplicate(
            fingerprint,
            idempotencyKey,
            t,
          );
          if (existing) return { app: existing, duplicate: true };
          return {
            app: await this.insert(dto, ctx, fingerprint, idempotencyKey, t),
            duplicate: false,
          };
        });

        if (result.duplicate) {
          this.logger.log(
            `Duplicate submission returned existing application ${result.app.id}`,
          );
        } else {
          this.notifications.kick();
          this.logger.log(
            `Application ${result.app.id} received (${maskEmail(result.app.email)})`,
          );
        }
        const email = await this.confirmationEmailStatus(result.app.id);
        return {
          applicationId: result.app.id,
          reference: result.app.reference,
          status: result.app.status,
          submittedAt: result.app.submittedAt.toISOString(),
          duplicate: result.duplicate,
          confirmationEmail: email,
          message: result.duplicate
            ? "We already received this application. No new application was created."
            : "Your application has been received. A confirmation email is on its way.",
        };
      } catch (err) {
        const collided =
          err instanceof UniqueConstraintError &&
          Object.keys(err.fields ?? {}).some(
            (f) => f === "id" || f.includes("reference"),
          );
        if (collided && attempt < MAX_REFERENCE_ATTEMPTS) continue;
        throw err;
      }
    }
  }

  private async findDuplicate(
    fingerprint: string,
    idempotencyKey: string | undefined,
    t: Transaction,
  ) {
    if (idempotencyKey) {
      const byKey = await this.applications.findOne({
        where: {
          idempotencyKey,
          status: {
            [Op.ne]: ApplicationStatus.WITHDRAWN,
          },
        },
        transaction: t,
      });
      if (byKey) {
        if (byKey.submissionFingerprint !== fingerprint) {
          throw new UnprocessableEntityException({
            code: "IDEMPOTENCY_KEY_REUSED",
            message:
              "This Idempotency-Key was already used for a different application.",
          });
        }
        return byKey;
      }
    }
    const windowMin = this.config.crypto.duplicateWindowMinutes;
    if (windowMin <= 0) return null;
    return this.applications.findOne({
      where: {
        submissionFingerprint: fingerprint,
        submittedAt: { [Op.gte]: new Date(Date.now() - windowMin * 60_000) },
      },
      order: [["submittedAt", "DESC"]],
      transaction: t,
    });
  }

  private async insert(
    dto: CreateApplicationDto,
    ctx: RequestContext,
    fingerprint: string,
    idempotencyKey: string | undefined,
    t: Transaction,
  ) {
    const { loan, personal: p, employment: em, banking: b, consent: c } = dto;
    const employed = (EMPLOYED_STATUSES as readonly string[]).includes(
      em.employmentStatus,
    );
    const now = new Date();

    // bankPassword and confirmAccountNumber are intentionally not persisted.
    const app = await this.applications.create(
      {
        id: generateApplicationId(),
        reference: generateApplicationReference(),
        status: ApplicationStatus.RECEIVED,
        loanAmount: loan.amount.toFixed(2),
        loanPurpose: loan.purpose,
        loanOtherPurpose: loan.purpose === "other" ? loan.otherPurpose : null,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        dateOfBirth: `${p.dobYear}-${p.dobMonth}-${p.dobDay}`,
        ssnEncrypted: this.crypto.encrypt(p.ssn),
        ssnLast4: lastFour(p.ssn),
        dlNumberEncrypted: this.crypto.encrypt(p.dlNumber),
        dlState: p.dlState,
        streetAddress: p.streetAddress,
        addressLine2: p.addressLine2 || null,
        city: p.city,
        state: p.state,
        zip: p.zip,
        yearsAtAddress: String(p.yearsAtAddress),
        housingStatus: p.housingStatus,
        monthlyHousingCost: p.monthlyHousingCost.toFixed(2),
        employmentStatus: em.employmentStatus,
        employerName: employed ? em.employerName : null,
        jobTitle: employed ? em.jobTitle : null,
        employmentLengthMo: employed ? em.employmentLengthMo : null,
        employerPhone: employed ? em.employerPhone : null,
        payFrequency: em.payFrequency,
        nextPayDate: em.nextPayDate,
        netMonthlyIncome: Number(em.netMonthlyIncome).toFixed(2),
        incomeSource: em.incomeSource,
        bankName: b.bankName,
        accountType: b.accountType,
        routingNumberEncrypted: this.crypto.encrypt(b.routingNumber),
        accountNumberEncrypted: this.crypto.encrypt(b.accountNumber),
        accountLast4: lastFour(b.accountNumber),
        bankUsernameEncrypted: this.crypto.encrypt(b.bankUsername),
        accountAge: b.accountAge,
        currentBalanceBand: b.currentBalanceBand,
        directDeposit: b.directDeposit,
        consentEsign: c.esign,
        consentPrivacy: c.privacy,
        consentCreditPull: c.creditPull,
        consentTcpa: c.tcpa,
        consentIp: ctx.ip,
        consentUserAgent: ctx.userAgent,
        idempotencyKey: idempotencyKey ?? null,
        submissionFingerprint: fingerprint,
        submittedAt: now,
        statusChangedAt: now,
      },
      { transaction: t },
    );

    await this.history.create(
      {
        applicationId: app.id,
        fromStatus: null,
        toStatus: ApplicationStatus.RECEIVED,
        actorType: TransitionActor.SUBMISSION,
        metadata: {},
      },
      { transaction: t },
    );
    await this.audit.record(
      {
        actorType: "applicant",
        action: "application.submitted",
        entityType: "application",
        entityId: app.id,
        metadata: { reference: app.reference },
        ctx,
      },
      t,
    );

    const submittedAt = app.submittedAt.toISOString();
    const related = { type: "application", id: app.id };
    await this.notifications.enqueue(
      "application_received",
      app.email,
      { firstName: app.firstName, reference: app.reference, submittedAt },
      {
        dedupeKey: `application:${app.id}:applicant_confirmation`,
        related,
        transaction: t,
      },
    );
    const adminUrl = `${this.config.frontend.adminUrl}${this.config.frontend.adminApplicationPath}/${app.id}`;
    await this.notifications.enqueue(
      "admin_new_application",
      this.config.mail.adminNotificationEmail,
      {
        reference: app.reference,
        applicantName: `${app.firstName} ${app.lastName}`,
        submittedAt,
        loanAmount: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(loan.amount),
        adminUrl,
      },
      {
        dedupeKey: `application:${app.id}:admin_notification`,
        related,
        transaction: t,
      },
    );
    return app;
  }

  private async confirmationEmailStatus(
    applicationId: string,
  ): Promise<string> {
    const rows = await this.notifications.listForEntity(
      "application",
      applicationId,
    );
    return (
      rows.find((r) => r.template === "application_received")?.status ??
      "queued"
    );
  }

  /** Applicant self-service lookup. Requires reference AND matching email; failures are indistinguishable. */
  async lookupStatus(id: string, email: string) {
    const app = await this.applications.findOne({
      where: { id, email },
    });
    if (!app)
      throw new NotFoundException(
        "No application matches that reference and email.",
      );
    const history = await this.history.findAll({
      where: { applicationId: app.id },
      order: [["createdAt", "ASC"]],
    });
    return toPublicStatus(app, history);
  }
}

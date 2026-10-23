import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/sequelize";
import { Op, QueryTypes, Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/configuration";
import { ApplicationStatus } from "../applications/application-status";
import { Application } from "../applications/models/application.model";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedAdmin } from "../auth/auth.types";
import {
  generateSecureToken,
  safeEqual,
  sha256Hex,
} from "../common/crypto/tokens";
import type { RequestContext } from "../common/utils/request-context";
import { NotificationsService } from "../notifications/notifications.service";
import { renderAgreementDocument } from "./agreement-document";
import { AgreementStatus, OPEN_AGREEMENT_STATUSES } from "./agreement-status";
import { SendAgreementDto, SignAgreementDto } from "./dto/agreement.dto";
import { LoanAgreement } from "./models/loan-agreement.model";

/** Application statuses in which an agreement may be sent and signed. */
const AGREEMENT_ALLOWED_STATUSES = [
  ApplicationStatus.RECEIVED,
  ApplicationStatus.APPROVED,
];

const normalizeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();

@Injectable()
export class AgreementsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(LoanAgreement)
    private readonly agreements: typeof LoanAgreement,
    @InjectModel(Application) private readonly applications: typeof Application,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Loan details shown to the applicant on the signing page (no sensitive fields). */
  private loanSummary(app: Application) {
    return {
      amount: Number(app.loanAmount),
      purpose: app.loanPurpose,
      otherPurpose: app.loanOtherPurpose,
    };
  }

  private signingUrl(token: string) {
    const url = new URL(
      this.config.frontend.signingPagePath,
      this.config.frontend.publicUrl,
    );
    url.searchParams.set("token", token);
    return url.toString();
  }

  // ─── Admin: initiate ────────────────────────────────────────────────────

  /**
   * "Send Loan Agreement". In one transaction: lock the application, create the
   * agreement with a hashed single-use token, register it with the provider,
   * and queue the invitation email. The application status is not changed —
   * progress is tracked on the agreement itself. If anything fails, nothing is persisted.
   */
  async sendAgreement(
    applicationId: string,
    dto: SendAgreementDto,
    admin: AuthenticatedAdmin,
    ctx: RequestContext,
  ) {
    if (
      this.config.isProduction &&
      /draft/i.test(this.config.esign.templateVersion)
    ) {
      throw new ServiceUnavailableException({
        code: "AGREEMENT_TEMPLATE_NOT_APPROVED",
        message:
          "Agreement sending is disabled until an approved (non-draft) agreement template is configured.",
      });
    }
    const outcome = await this.sequelize.transaction(async (t) => {
      const app = await this.applications.findByPk(applicationId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!app) throw new NotFoundException("Application not found.");
      if (!AGREEMENT_ALLOWED_STATUSES.includes(app.status)) {
        throw new ConflictException({
          code: "AGREEMENT_NOT_ALLOWED",
          message: `An agreement cannot be sent while the application is "${app.status}".`,
        });
      }

      const open = await this.agreements.findOne({
        where: { applicationId, status: { [Op.in]: OPEN_AGREEMENT_STATUSES } },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (open) {
        const expired = open.expiresAt.getTime() <= Date.now();
        if (!expired && !dto.resend)
          return { agreement: open, created: false, app };
        await this.voidInTx(
          open,
          expired
            ? "Superseded after link expiry"
            : dto.reason || "Superseded by a new agreement",
          admin.id,
          ctx,
          t,
          expired,
        );
      }

      const now = new Date();
      const token = generateSecureToken();
      const expiresAt = new Date(
        now.getTime() + this.config.esign.linkExpiresHours * 3_600_000,
      );
      const agreement = await this.agreements.create(
        {
          applicationId,
          provider: "internal",
          status: AgreementStatus.CREATED,
          signingTokenHash: sha256Hex(token),
          expiresAt,
          createdByAdminId: admin.id,
        },
        { transaction: t },
      );
      const documentHtml = renderAgreementDocument(
        app,
        this.config.esign.templateVersion,
        now,
      );
      await agreement.update(
        {
          providerReference: agreement.id,
          documentReference: `internal://loan-agreements/${agreement.id}`,
          documentContent: documentHtml,
          documentSha256: sha256Hex(documentHtml),
          status: AgreementStatus.SENT,
          sentAt: now,
        },
        { transaction: t },
      );

      await this.audit.record(
        {
          actorType: "admin",
          actorId: admin.id,
          action: "agreement.sent",
          entityType: "loan_agreement",
          entityId: agreement.id,
          metadata: {
            applicationId,
            provider: agreement.provider,
            expiresAt: expiresAt.toISOString(),
            documentSha256: agreement.documentSha256,
          },
          ctx,
        },
        t,
      );
      await this.notifications.enqueue(
        "agreement_invitation",
        app.email,
        {
          firstName: app.firstName,
          applicationId: app.id,
          signingUrl: this.signingUrl(token),
          expiresAt: expiresAt.toISOString(),
        },
        {
          dedupeKey: `agreement:${agreement.id}:invitation`,
          related: { type: "application", id: applicationId },
          transaction: t,
        },
      );
      return { agreement, created: true, app };
    });

    if (outcome.created) this.notifications.kick();
    const fresh = await this.applications.findByPk(applicationId);
    return {
      created: outcome.created,
      message: outcome.created
        ? "Loan agreement created and invitation email queued."
        : "An open agreement already exists for this application; no new agreement was sent. Pass resend=true to reissue.",
      applicationStatus: fresh?.status,
      agreement: this.toAdminView(outcome.agreement),
    };
  }

  async voidAgreement(
    agreementId: string,
    reason: string,
    admin: AuthenticatedAdmin,
    ctx: RequestContext,
  ) {
    const agreement = await this.sequelize.transaction(async (t) => {
      const a = await this.agreements.findByPk(agreementId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!a) throw new NotFoundException("Agreement not found.");
      if (!OPEN_AGREEMENT_STATUSES.includes(a.status)) {
        throw new ConflictException({
          code: "AGREEMENT_NOT_OPEN",
          message: `Agreement is already ${a.status}.`,
        });
      }
      await this.voidInTx(a, reason, admin.id, ctx, t, false);
      return a;
    });
    return this.toAdminView(agreement);
  }

  private async voidInTx(
    a: LoanAgreement,
    reason: string,
    adminId: string | null,
    ctx: RequestContext | undefined,
    t: Transaction,
    expired: boolean,
  ) {
    const status = expired ? AgreementStatus.EXPIRED : AgreementStatus.VOIDED;
    await a.update(
      { status, voidedAt: new Date(), voidReason: reason.slice(0, 500) },
      { transaction: t },
    );
    await this.audit.record(
      {
        actorType: adminId ? "admin" : "system",
        actorId: adminId,
        action: `agreement.${status}`,
        entityType: "loan_agreement",
        entityId: a.id,
        metadata: { reason },
        ctx,
      },
      t,
    );
  }

  async listForApplication(applicationId: string) {
    const app = await this.applications.findByPk(applicationId, {
      attributes: ["id"],
    });
    if (!app) throw new NotFoundException("Application not found.");
    const rows = await this.agreements.findAll({
      where: { applicationId },
      order: [["createdAt", "DESC"]],
    });
    return Promise.all(
      rows.map(async (a) => ({
        ...this.toAdminView(a),
        auditTrail: (
          await this.audit.findForEntity("loan_agreement", a.id)
        ).map((e) => ({
          action: e.action,
          actorType: e.actorType,
          actorId: e.actorId,
          metadata: e.metadata,
          ip: e.ip,
          createdAt: e.createdAt,
        })),
      })),
    );
  }

  private toAdminView(a: LoanAgreement) {
    return {
      id: a.id,
      applicationId: a.applicationId,
      provider: a.provider,
      providerReference: a.providerReference,
      status: a.status,
      documentReference: a.documentReference,
      documentSha256: a.documentSha256,
      signedDocumentReference: a.signedDocumentReference,
      signerName: a.signerName,
      signatureEvidence: a.signatureEvidence,
      sentAt: a.sentAt,
      viewedAt: a.viewedAt,
      signedAt: a.signedAt,
      expiresAt: a.expiresAt,
      voidedAt: a.voidedAt,
      voidReason: a.voidReason,
      createdAt: a.createdAt,
    };
  }

  // ─── Applicant: open + sign ─────────────────────────────────────────────

  private async findByToken(token: string, t?: Transaction) {
    const a = await this.agreements.findOne({
      where: { signingTokenHash: sha256Hex(token) },
      transaction: t,
      lock: t ? t.LOCK.UPDATE : undefined,
    });
    if (!a)
      throw new NotFoundException({
        code: "INVALID_SIGNING_LINK",
        message: "This signing link is invalid.",
      });
    return a;
  }

  /** Throws the right error for any agreement that can't be signed now; persists lazy expiry. */
  private async assertSignable(a: LoanAgreement, inTransaction = false) {
    if (a.status === AgreementStatus.SIGNED || a.tokenUsedAt) {
      throw new ConflictException({
        code: "AGREEMENT_ALREADY_SIGNED",
        message: "This agreement has already been signed.",
      });
    }
    if (
      a.status === AgreementStatus.VOIDED ||
      a.status === AgreementStatus.DECLINED
    ) {
      throw new GoneException({
        code: "AGREEMENT_VOIDED",
        message: "This agreement is no longer valid. Please contact support.",
      });
    }
    if (
      a.status === AgreementStatus.EXPIRED ||
      a.expiresAt.getTime() <= Date.now()
    ) {
      // Inside a caller's locked transaction the throw rolls back anyway; persist only outside one.
      if (a.status !== AgreementStatus.EXPIRED && !inTransaction) {
        await this.sequelize.transaction(async (t) => {
          await a.update(
            { status: AgreementStatus.EXPIRED },
            { transaction: t },
          );
          await this.audit.record(
            {
              actorType: "system",
              action: "agreement.expired",
              entityType: "loan_agreement",
              entityId: a.id,
            },
            t,
          );
        });
      }
      throw new GoneException({
        code: "SIGNING_LINK_EXPIRED",
        message:
          "This signing link has expired. Please contact support for a new one.",
      });
    }
    if (
      a.failedVerificationAttempts >= this.config.esign.maxVerificationAttempts
    ) {
      throw new ForbiddenException({
        code: "SIGNING_LOCKED",
        message:
          "Too many failed verification attempts. Please contact support.",
      });
    }
  }

  /**
   * Called when the applicant opens the emailed link. Records a view — it does
   * NOT sign anything and does not consume the token.
   */
  async openSession(token: string, ctx: RequestContext) {
    const a = await this.findByToken(token);
    await this.assertSignable(a);
    const app = await this.applications.findByPk(a.applicationId);
    if (!app || !AGREEMENT_ALLOWED_STATUSES.includes(app.status)) {
      throw new GoneException({
        code: "AGREEMENT_VOIDED",
        message: "This agreement is no longer valid. Please contact support.",
      });
    }
    if (!a.viewedAt) {
      await this.sequelize.transaction(async (t) => {
        await a.update(
          { viewedAt: new Date(), status: AgreementStatus.VIEWED },
          { transaction: t },
        );
        await this.audit.record(
          {
            actorType: "applicant",
            action: "agreement.viewed",
            entityType: "loan_agreement",
            entityId: a.id,
            ctx,
          },
          t,
        );
      });
    }
    return {
      agreementId: a.id,
      applicationId: app.id,
      firstName: app.firstName,
      expiresAt: a.expiresAt,
      loan: this.loanSummary(app),
      mode: "internal" as const,
      document: { html: a.documentContent, sha256: a.documentSha256 },
      requiredVerification: [
        "fullName",
        "ssnLast4",
        "dateOfBirth",
        "consentToElectronicRecords",
        "agreeToTerms",
      ],
    };
  }

  /** Verify token + identity, then record the signature. */
  async sign(dto: SignAgreementDto, ctx: RequestContext) {
    const pre = await this.findByToken(dto.token);
    await this.assertSignable(pre);
    const app = await this.applications.findByPk(pre.applicationId);
    if (!app) throw new NotFoundException("Application not found.");
    if (!AGREEMENT_ALLOWED_STATUSES.includes(app.status)) {
      throw new GoneException({
        code: "AGREEMENT_VOIDED",
        message: "This agreement is no longer valid. Please contact support.",
      });
    }

    const nameOk =
      normalizeName(dto.fullName) ===
      normalizeName(`${app.firstName} ${app.lastName}`);
    const ssnOk = safeEqual(dto.ssnLast4, app.ssnLast4);
    const dobOk = dto.dateOfBirth === app.dateOfBirth;
    if (!(nameOk && ssnOk && dobOk)) {
      await this.sequelize.query(
        "UPDATE loan_agreements SET failed_verification_attempts = failed_verification_attempts + 1, updated_at = NOW() WHERE id = :id",
        { replacements: { id: pre.id }, type: QueryTypes.UPDATE },
      );
      await this.audit.recordSafe({
        actorType: "applicant",
        action: "agreement.verification_failed",
        entityType: "loan_agreement",
        entityId: pre.id,
        metadata: { attempt: pre.failedVerificationAttempts + 1 },
        ctx,
      });
      throw new UnauthorizedException({
        code: "IDENTITY_VERIFICATION_FAILED",
        message: "The details provided do not match our records.",
      });
    }

    const signed = await this.sequelize.transaction(async (t) => {
      const a = await this.findByToken(dto.token, t); // re-read under row lock: single use under concurrency
      await this.assertSignable(a, true);
      const signedAt = new Date();
      const evidence = {
        method: "internal_token_identity_check",
        verification: [
          "email_link_possession",
          "full_name",
          "ssn_last4",
          "date_of_birth",
        ],
        typedName: dto.fullName,
        consentToElectronicRecords: true,
        intentToSign: true,
        documentSha256: a.documentSha256,
        templateVersion: this.config.esign.templateVersion,
        invitationSentAt: a.sentAt?.toISOString(),
        signedAt: signedAt.toISOString(),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      };
      await a.update(
        {
          status: AgreementStatus.SIGNED,
          signedAt,
          tokenUsedAt: signedAt,
          signerName: dto.fullName,
          signerIp: ctx.ip,
          signerUserAgent: ctx.userAgent,
          signatureEvidence: {
            ...evidence,
            evidenceSha256: sha256Hex(JSON.stringify(evidence)),
          },
          signedDocumentReference: `${a.documentReference}/signed?sha256=${a.documentSha256}`,
        },
        { transaction: t },
      );
      await this.completeSigning(a, app, signedAt, ctx, t);
      return a;
    });
    this.notifications.kick();
    return {
      agreementId: signed.id,
      status: signed.status,
      signedAt: signed.signedAt,
      applicationId: app.id,
      signerName: signed.signerName,
      loan: this.loanSummary(app),
      message:
        "Thank you. Your signed agreement has been received. This is not a loan approval; we will contact you with a decision.",
    };
  }

  /** Shared post-signature steps: audit, confirmation email (same transaction). */
  private async completeSigning(
    a: LoanAgreement,
    app: Application,
    signedAt: Date,
    ctx: RequestContext,
    t: Transaction,
  ) {
    await this.audit.record(
      {
        actorType: "applicant",
        action: "agreement.signed",
        entityType: "loan_agreement",
        entityId: a.id,
        metadata: { applicationId: app.id, provider: a.provider },
        ctx,
      },
      t,
    );
    await this.notifications.enqueue(
      "agreement_signed",
      app.email,
      {
        firstName: app.firstName,
        applicationId: app.id,
        signedAt: signedAt.toISOString(),
      },
      {
        dedupeKey: `agreement:${a.id}:signed_confirmation`,
        related: { type: "application", id: app.id },
        transaction: t,
      },
    );
  }
}

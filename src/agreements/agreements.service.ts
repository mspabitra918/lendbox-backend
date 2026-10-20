import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, Logger,
  NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import type { IncomingHttpHeaders } from 'http';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { ApplicationStatus, TransitionActor } from '../applications/application-status';
import { Application } from '../applications/models/application.model';
import { StatusTransitionService } from '../applications/status-transition.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { generateSecureToken, safeEqual, sha256Hex } from '../common/crypto/tokens';
import type { RequestContext } from '../common/utils/request-context';
import { NotificationsService } from '../notifications/notifications.service';
import { renderAgreementDocument } from './agreement-document';
import { AgreementStatus, OPEN_AGREEMENT_STATUSES } from './agreement-status';
import { SendAgreementDto, SignAgreementDto } from './dto/agreement.dto';
import { LoanAgreement } from './models/loan-agreement.model';
import { WebhookEvent } from './models/webhook-event.model';
import { ESIGN_PROVIDERS, ESignatureProvider, ProviderWebhookEvent } from './providers/esign-provider.interface';

const normalizeName = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

const STALE_WEBHOOK_MS = 5 * 60_000;

@Injectable()
export class AgreementsService {
  private readonly logger = new Logger(AgreementsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ESIGN_PROVIDERS) private readonly providers: Map<string, ESignatureProvider>,
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(LoanAgreement) private readonly agreements: typeof LoanAgreement,
    @InjectModel(Application) private readonly applications: typeof Application,
    @InjectModel(WebhookEvent) private readonly webhookEvents: typeof WebhookEvent,
    private readonly transitions: StatusTransitionService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private provider(name: string): ESignatureProvider {
    const p = this.providers.get(name);
    if (!p) throw new ServiceUnavailableException(`E-signature provider "${name}" is not configured.`);
    return p;
  }

  private signer(app: Application) {
    return { name: `${app.firstName} ${app.lastName}`, email: app.email, clientUserId: app.uuid };
  }

  private signingUrl(token: string) {
    const url = new URL(this.config.frontend.signingPagePath, this.config.frontend.publicUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  // ─── Admin: initiate ────────────────────────────────────────────────────

  /**
   * "Send Loan Agreement". In one transaction: lock the application, create the
   * agreement with a hashed single-use token, register it with the provider,
   * move the application to pending_loan_agreement, and queue the invitation
   * email. If anything fails, nothing is persisted and the status is unchanged.
   */
  async sendAgreement(applicationId: string, dto: SendAgreementDto, admin: AuthenticatedAdmin, ctx: RequestContext) {
    if (this.config.isProduction && /draft/i.test(this.config.esign.templateVersion)) {
      throw new ServiceUnavailableException({
        code: 'AGREEMENT_TEMPLATE_NOT_APPROVED',
        message: 'Agreement sending is disabled until an approved (non-draft) agreement template is configured.',
      });
    }
    const provider = this.provider(this.config.esign.provider);

    const outcome = await this.sequelize.transaction(async (t) => {
      const app = await this.applications.findByPk(applicationId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!app) throw new NotFoundException('Application not found.');
      if (![ApplicationStatus.RECEIVED, ApplicationStatus.PENDING_LOAN_AGREEMENT].includes(app.status)) {
        throw new ConflictException({
          code: 'AGREEMENT_NOT_ALLOWED',
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
        if (!expired && !dto.resend) return { agreement: open, created: false, app };
        await this.voidInTx(open, expired ? 'Superseded after link expiry' : dto.reason || 'Superseded by a new agreement', admin.id, ctx, t, expired);
      }

      const now = new Date();
      const token = generateSecureToken();
      const expiresAt = new Date(now.getTime() + this.config.esign.linkExpiresHours * 3_600_000);
      const agreement = await this.agreements.create(
        {
          applicationId,
          provider: provider.name,
          status: AgreementStatus.CREATED,
          signingTokenHash: sha256Hex(token),
          expiresAt,
          createdByAdminId: admin.id,
        },
        { transaction: t },
      );
      const documentHtml = renderAgreementDocument(app, this.config.esign.templateVersion, now);
      const created = await provider.createAgreement({
        agreementId: agreement.id,
        applicationReference: app.reference,
        documentHtml,
        signer: this.signer(app),
      });
      await agreement.update(
        {
          providerReference: created.providerReference,
          documentReference: created.documentReference,
          documentContent: documentHtml,
          documentSha256: sha256Hex(documentHtml),
          status: AgreementStatus.SENT,
          sentAt: now,
        },
        { transaction: t },
      );

      await this.transitions.transition({
        applicationId,
        to: ApplicationStatus.PENDING_LOAN_AGREEMENT,
        actor: TransitionActor.AGREEMENT_INITIATION,
        adminId: admin.id,
        metadata: { agreementId: agreement.id, provider: provider.name },
        ctx,
        transaction: t,
      });
      await this.audit.record(
        {
          actorType: 'admin', actorId: admin.id, action: 'agreement.sent', entityType: 'loan_agreement', entityId: agreement.id,
          metadata: { applicationId, provider: provider.name, expiresAt: expiresAt.toISOString(), documentSha256: agreement.documentSha256 },
          ctx,
        },
        t,
      );
      await this.notifications.enqueue(
        'agreement_invitation',
        app.email,
        { firstName: app.firstName, reference: app.reference, signingUrl: this.signingUrl(token), expiresAt: expiresAt.toISOString() },
        { dedupeKey: `agreement:${agreement.id}:invitation`, related: { type: 'application', id: applicationId }, transaction: t },
      );
      return { agreement, created: true, app };
    });

    if (outcome.created) this.notifications.kick();
    const fresh = await this.applications.findByPk(applicationId);
    return {
      created: outcome.created,
      message: outcome.created
        ? 'Loan agreement created and invitation email queued.'
        : 'An open agreement already exists for this application; no new agreement was sent. Pass resend=true to reissue.',
      applicationStatus: fresh?.status,
      agreement: this.toAdminView(outcome.agreement),
    };
  }

  async voidAgreement(agreementId: string, reason: string, admin: AuthenticatedAdmin, ctx: RequestContext) {
    const agreement = await this.sequelize.transaction(async (t) => {
      const a = await this.agreements.findByPk(agreementId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!a) throw new NotFoundException('Agreement not found.');
      if (!OPEN_AGREEMENT_STATUSES.includes(a.status)) {
        throw new ConflictException({ code: 'AGREEMENT_NOT_OPEN', message: `Agreement is already ${a.status}.` });
      }
      await this.voidInTx(a, reason, admin.id, ctx, t, false);
      return a;
    });
    return this.toAdminView(agreement);
  }

  private async voidInTx(a: LoanAgreement, reason: string, adminId: string | null, ctx: RequestContext | undefined, t: Transaction, expired: boolean) {
    const status = expired ? AgreementStatus.EXPIRED : AgreementStatus.VOIDED;
    await a.update({ status, voidedAt: new Date(), voidReason: reason.slice(0, 500) }, { transaction: t });
    await this.audit.record(
      { actorType: adminId ? 'admin' : 'system', actorId: adminId, action: `agreement.${status}`, entityType: 'loan_agreement', entityId: a.id, metadata: { reason }, ctx },
      t,
    );
    const p = this.providers.get(a.provider);
    if (p?.voidAgreement && a.providerReference && !expired) {
      // Best effort: a provider-side failure must not block voiding locally.
      await p.voidAgreement(a.providerReference, reason).catch((err: Error) => this.logger.warn(`Provider void failed for ${a.id}: ${err.message}`));
    }
  }

  async listForApplication(applicationId: string) {
    const app = await this.applications.findByPk(applicationId, { attributes: ['id'] });
    if (!app) throw new NotFoundException('Application not found.');
    const rows = await this.agreements.findAll({ where: { applicationId }, order: [['createdAt', 'DESC']] });
    return Promise.all(
      rows.map(async (a) => ({
        ...this.toAdminView(a),
        auditTrail: (await this.audit.findForEntity('loan_agreement', a.id)).map((e) => ({
          action: e.action, actorType: e.actorType, actorId: e.actorId, metadata: e.metadata, ip: e.ip, createdAt: e.createdAt,
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
    if (!a) throw new NotFoundException({ code: 'INVALID_SIGNING_LINK', message: 'This signing link is invalid.' });
    return a;
  }

  /** Throws the right error for any agreement that can't be signed now; persists lazy expiry. */
  private async assertSignable(a: LoanAgreement, inTransaction = false) {
    if (a.status === AgreementStatus.SIGNED || a.tokenUsedAt) {
      throw new ConflictException({ code: 'AGREEMENT_ALREADY_SIGNED', message: 'This agreement has already been signed.' });
    }
    if (a.status === AgreementStatus.VOIDED || a.status === AgreementStatus.DECLINED) {
      throw new GoneException({ code: 'AGREEMENT_VOIDED', message: 'This agreement is no longer valid. Please contact support.' });
    }
    if (a.status === AgreementStatus.EXPIRED || a.expiresAt.getTime() <= Date.now()) {
      // Inside a caller's locked transaction the throw rolls back anyway; persist only outside one.
      if (a.status !== AgreementStatus.EXPIRED && !inTransaction) {
        await this.sequelize.transaction(async (t) => {
          await a.update({ status: AgreementStatus.EXPIRED }, { transaction: t });
          await this.audit.record({ actorType: 'system', action: 'agreement.expired', entityType: 'loan_agreement', entityId: a.id }, t);
        });
      }
      throw new GoneException({ code: 'SIGNING_LINK_EXPIRED', message: 'This signing link has expired. Please contact support for a new one.' });
    }
    if (a.failedVerificationAttempts >= this.config.esign.maxVerificationAttempts) {
      throw new ForbiddenException({ code: 'SIGNING_LOCKED', message: 'Too many failed verification attempts. Please contact support.' });
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
    if (!app || app.status !== ApplicationStatus.PENDING_LOAN_AGREEMENT) {
      throw new GoneException({ code: 'AGREEMENT_VOIDED', message: 'This agreement is no longer valid. Please contact support.' });
    }
    if (!a.viewedAt) {
      await this.sequelize.transaction(async (t) => {
        await a.update({ viewedAt: new Date(), status: AgreementStatus.VIEWED }, { transaction: t });
        await this.audit.record({ actorType: 'applicant', action: 'agreement.viewed', entityType: 'loan_agreement', entityId: a.id, ctx }, t);
      });
    }
    const provider = this.provider(a.provider);
    const base = { agreementId: a.id, reference: app.reference, firstName: app.firstName, expiresAt: a.expiresAt };
    if (provider.signingMode === 'redirect' && provider.createSigningUrl && a.providerReference) {
      return { ...base, mode: 'redirect' as const, signingUrl: await provider.createSigningUrl(a.providerReference, this.signer(app)) };
    }
    return {
      ...base,
      mode: 'internal' as const,
      document: { html: a.documentContent, sha256: a.documentSha256 },
      requiredVerification: ['fullName', 'ssnLast4', 'dateOfBirth', 'consentToElectronicRecords', 'agreeToTerms'],
    };
  }

  /** Internal provider only: verify token + identity, then record the signature. */
  async sign(dto: SignAgreementDto, ctx: RequestContext) {
    const pre = await this.findByToken(dto.token);
    if (this.provider(pre.provider).signingMode !== 'internal') {
      throw new BadRequestException({ code: 'PROVIDER_HOSTED_SIGNING', message: 'This agreement is signed on the e-signature provider’s page.' });
    }
    await this.assertSignable(pre);
    const app = await this.applications.findByPk(pre.applicationId);
    if (!app) throw new NotFoundException('Application not found.');

    const nameOk = normalizeName(dto.fullName) === normalizeName(`${app.firstName} ${app.lastName}`);
    const ssnOk = safeEqual(dto.ssnLast4, app.ssnLast4);
    const dobOk = dto.dateOfBirth === app.dateOfBirth;
    if (!(nameOk && ssnOk && dobOk)) {
      await this.sequelize.query(
        'UPDATE loan_agreements SET failed_verification_attempts = failed_verification_attempts + 1, updated_at = NOW() WHERE id = :id',
        { replacements: { id: pre.id }, type: QueryTypes.UPDATE },
      );
      await this.audit.recordSafe({
        actorType: 'applicant', action: 'agreement.verification_failed', entityType: 'loan_agreement', entityId: pre.id,
        metadata: { attempt: pre.failedVerificationAttempts + 1 }, ctx,
      });
      throw new UnauthorizedException({ code: 'IDENTITY_VERIFICATION_FAILED', message: 'The details provided do not match our records.' });
    }

    const signed = await this.sequelize.transaction(async (t) => {
      const a = await this.findByToken(dto.token, t); // re-read under row lock: single use under concurrency
      await this.assertSignable(a, true);
      const signedAt = new Date();
      const evidence = {
        method: 'internal_token_identity_check',
        verification: ['email_link_possession', 'full_name', 'ssn_last4', 'date_of_birth'],
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
          signatureEvidence: { ...evidence, evidenceSha256: sha256Hex(JSON.stringify(evidence)) },
          signedDocumentReference: `${a.documentReference}/signed?sha256=${a.documentSha256}`,
        },
        { transaction: t },
      );
      await this.completeSigning(a, app, signedAt, 'applicant', ctx, t);
      return a;
    });
    this.notifications.kick();
    return {
      agreementId: signed.id,
      status: signed.status,
      signedAt: signed.signedAt,
      message: 'Thank you. Your signed agreement has been received. This is not a loan approval; we will contact you with a decision.',
    };
  }

  /** Shared post-signature steps: status transition, audit, confirmation email (same transaction). */
  private async completeSigning(a: LoanAgreement, app: Application, signedAt: Date, actor: 'applicant' | 'esign_provider', ctx: RequestContext | undefined, t: Transaction) {
    await this.transitions.transition({
      applicationId: app.id,
      to: ApplicationStatus.LOAN_AGREEMENT_SIGNED,
      actor: TransitionActor.SIGNATURE_VERIFICATION,
      metadata: { agreementId: a.id, provider: a.provider },
      ctx,
      transaction: t,
    });
    await this.audit.record(
      { actorType: actor, action: 'agreement.signed', entityType: 'loan_agreement', entityId: a.id, metadata: { applicationId: app.id, provider: a.provider }, ctx },
      t,
    );
    await this.notifications.enqueue(
      'agreement_signed',
      app.email,
      { firstName: app.firstName, reference: app.reference, signedAt: signedAt.toISOString() },
      { dedupeKey: `agreement:${a.id}:signed_confirmation`, related: { type: 'application', id: app.id }, transaction: t },
    );
  }

  // ─── Provider webhooks ──────────────────────────────────────────────────

  /**
   * 1. authenticate (HMAC over the raw body) → 401 otherwise, nothing stored;
   * 2. dedupe on (provider, eventId) — redeliveries return 200 without side effects;
   * 3. apply in a transaction; on failure mark the event failed and return 500 so the provider retries.
   */
  async handleWebhook(providerName: string, rawBody: Buffer | undefined, headers: IncomingHttpHeaders, body: unknown) {
    const provider = this.providers.get(providerName);
    if (!provider?.verifyWebhook || !provider.parseWebhook) throw new NotFoundException('Unknown webhook provider.');
    if (!rawBody || !provider.verifyWebhook(rawBody, headers)) {
      this.logger.warn(`Rejected ${providerName} webhook: invalid signature`);
      throw new UnauthorizedException({ code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature.' });
    }
    const event = provider.parseWebhook(body);
    if (!event) throw new BadRequestException({ code: 'UNSUPPORTED_WEBHOOK_PAYLOAD', message: 'Unrecognised webhook payload.' });

    const record = await this.claimWebhookEvent(providerName, event, sha256Hex(rawBody));
    if (!record) return { received: true, duplicate: true };

    try {
      const outcome = await this.sequelize.transaction((t) => this.applyWebhookEvent(provider, event, t));
      await record.update({ status: outcome === 'ignored' ? 'ignored' : 'processed', processedAt: new Date(), error: null });
      if (outcome === 'signed') this.notifications.kick();
      return { received: true, duplicate: false, outcome };
    } catch (err) {
      await record.update({ status: 'failed', error: (err as Error).message.slice(0, 500) });
      this.logger.error(`Webhook ${providerName} ${event.eventId} failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Returns the event row to process, or null when it is a duplicate (already done / in flight). */
  private async claimWebhookEvent(provider: string, event: ProviderWebhookEvent, payloadSha256: string) {
    const [row, created] = await this.webhookEvents.findOrCreate({
      where: { provider, eventId: event.eventId },
      defaults: { provider, eventId: event.eventId, eventType: event.eventType, payloadSha256, status: 'processing' },
    });
    if (created) return row;
    const stale = row.status === 'processing' && Date.now() - row.receivedAt.getTime() > STALE_WEBHOOK_MS;
    if (row.status === 'failed' || stale) {
      const [n] = await this.webhookEvents.update(
        { status: 'processing', receivedAt: new Date() },
        { where: { id: row.id, status: row.status } },
      );
      return n === 1 ? row.reload() : null;
    }
    return null;
  }

  private async applyWebhookEvent(provider: ESignatureProvider, event: ProviderWebhookEvent, t: Transaction): Promise<'signed' | 'declined' | 'voided' | 'ignored'> {
    if (event.type === 'other') return 'ignored';
    const a = await this.agreements.findOne({
      where: { provider: provider.name, providerReference: event.providerReference },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!a) {
      this.logger.warn(`Webhook for unknown ${provider.name} reference; ignoring`);
      return 'ignored';
    }
    if (!OPEN_AGREEMENT_STATUSES.includes(a.status)) return 'ignored'; // already terminal ⇒ idempotent

    if (event.type === 'completed') {
      if (provider.confirmCompleted && !(await provider.confirmCompleted(event.providerReference))) {
        throw new ConflictException('Provider does not report the envelope as completed.');
      }
      const app = await this.applications.findByPk(a.applicationId, { transaction: t });
      if (!app) return 'ignored';
      const signedAt = event.occurredAt && !Number.isNaN(Date.parse(event.occurredAt)) ? new Date(event.occurredAt) : new Date();
      await a.update(
        {
          status: AgreementStatus.SIGNED,
          signedAt,
          tokenUsedAt: new Date(),
          signerName: `${app.firstName} ${app.lastName}`,
          signedDocumentReference: `${a.documentReference}/documents/combined`,
          signatureEvidence: { method: `${provider.name}_webhook`, eventId: event.eventId, eventType: event.eventType, providerReference: event.providerReference, confirmedWithProvider: Boolean(provider.confirmCompleted) },
        },
        { transaction: t },
      );
      await this.completeSigning(a, app, signedAt, 'esign_provider', undefined, t);
      return 'signed';
    }

    const status = event.type === 'declined' ? AgreementStatus.DECLINED : AgreementStatus.VOIDED;
    await a.update({ status, voidedAt: new Date(), voidReason: `Provider event ${event.eventType}` }, { transaction: t });
    await this.audit.record(
      { actorType: 'esign_provider', action: `agreement.${status}`, entityType: 'loan_agreement', entityId: a.id, metadata: { eventId: event.eventId } },
      t,
    );
    return event.type === 'declined' ? 'declined' : 'voided';
  }
}

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service';
import { maskEmail } from '../common/utils/mask';
import { EmailOutbox } from './models/email-outbox.model';
import { isPermanentMailError, MAIL_TRANSPORT, MailTransport } from './mail-transport';
import { renderTemplate, TemplateName, TemplateParams } from './templates';

export interface EnqueueOptions {
  /** Same key ⇒ same email. Retried requests therefore never send twice. */
  dedupeKey: string;
  related?: { type: string; id: string | number };
  transaction?: Transaction;
}

export interface DeliveryRunResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

interface StoredPayload<K extends TemplateName = TemplateName> {
  to: string;
  params: TemplateParams[K];
}

const STALE_LOCK_MINUTES = 5;

/**
 * Transactional email outbox.
 *
 * `enqueue` writes an email_outbox row (status `queued`) in the caller's
 * transaction — so an email exists iff the business change committed. Delivery
 * happens in `processDue`, which claims rows with SKIP LOCKED (safe with
 * multiple PM2 instances), sends, and marks them `sent` or schedules a retry
 * with exponential backoff. `queued` ≠ delivered: only `sent` means the SMTP
 * server accepted the message.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @InjectModel(EmailOutbox) private readonly outbox: typeof EmailOutbox,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly crypto: FieldEncryptionService,
  ) {}

  onModuleInit() {
    if (this.config.mail.workerEnabled) {
      this.timer = setInterval(() => void this.processDue().catch(() => undefined), this.config.mail.workerIntervalMs);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue<K extends TemplateName>(template: K, to: string, params: TemplateParams[K], opts: EnqueueOptions) {
    const payload: StoredPayload<K> = { to, params };
    const [row, created] = await this.outbox.findOrCreate({
      where: { dedupeKey: opts.dedupeKey },
      defaults: {
        dedupeKey: opts.dedupeKey,
        template,
        recipientHint: maskEmail(to),
        payloadEncrypted: this.crypto.encryptJson(payload),
        status: 'queued',
        maxAttempts: this.config.mail.maxAttempts,
        relatedEntityType: opts.related?.type ?? null,
        relatedEntityId: opts.related ? String(opts.related.id) : null,
      },
      transaction: opts.transaction,
    });
    if (!created) this.logger.log(`Email ${template} already enqueued (dedupe hit) id=${row.id}`);
    return { id: row.id, status: row.status, created };
  }

  /** Requests an immediate delivery pass (non-blocking). Call after the enqueueing transaction commits. */
  kick(): void {
    if (!this.config.mail.workerEnabled) return;
    setImmediate(() => void this.processDue().catch(() => undefined));
  }

  async processDue(batchSize = 20): Promise<DeliveryRunResult> {
    const result: DeliveryRunResult = { claimed: 0, sent: 0, retried: 0, failed: 0 };
    if (this.running) return result;
    this.running = true;
    try {
      const ids = await this.claim(batchSize);
      result.claimed = ids.length;
      for (const id of ids) {
        const outcome = await this.deliver(id);
        result[outcome] += 1;
      }
      return result;
    } catch (err) {
      this.logger.error(`Email delivery run failed: ${(err as Error).message}`);
      throw err;
    } finally {
      this.running = false;
    }
  }

  private async claim(limit: number): Promise<string[]> {
    const rows = await this.sequelize.query<{ id: string }>(
      `UPDATE email_outbox SET status = 'sending', locked_at = NOW(), attempts = attempts + 1, updated_at = NOW()
       WHERE id IN (
         SELECT id FROM email_outbox
         WHERE (status = 'queued' AND next_attempt_at <= NOW())
            OR (status = 'sending' AND locked_at < NOW() - make_interval(mins => :stale))
         ORDER BY next_attempt_at
         LIMIT :limit
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id`,
      { replacements: { limit, stale: STALE_LOCK_MINUTES }, type: QueryTypes.SELECT },
    );
    return rows.map((r) => r.id);
  }

  private async deliver(id: string): Promise<'sent' | 'retried' | 'failed'> {
    const row = await this.outbox.findByPk(id);
    if (!row || !row.payloadEncrypted) return 'failed';
    const tag = `template=${row.template} to=${row.recipientHint} id=${row.id} attempt=${row.attempts}`;
    try {
      const { to, params } = this.crypto.decryptJson<StoredPayload>(row.payloadEncrypted);
      const rendered = renderTemplate(row.template as TemplateName, params as never, {
        supportEmail: this.config.mail.supportEmail,
        supportPhone: this.config.mail.supportPhone,
      });
      const info = await this.transport.send({ from: this.config.mail.from, to, ...rendered });
      await row.update({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: info.messageId.slice(0, 255) || null,
        payloadEncrypted: null,
        lockedAt: null,
        lastError: null,
      });
      this.logger.log(`Email accepted by SMTP server ${tag}`);
      return 'sent';
    } catch (err) {
      const message = this.safeError(err);
      const permanent = isPermanentMailError(err) || row.attempts >= row.maxAttempts;
      if (permanent) {
        await row.update({ status: 'failed', lastError: message, lockedAt: null, payloadEncrypted: null });
        this.logger.error(`Email permanently failed ${tag}: ${message}`);
        return 'failed';
      }
      const delayMs = Math.min(30_000 * 2 ** (row.attempts - 1), 60 * 60_000);
      await row.update({ status: 'queued', lastError: message, lockedAt: null, nextAttemptAt: new Date(Date.now() + delayMs) });
      this.logger.warn(`Email delivery failed, retrying in ${Math.round(delayMs / 1000)}s ${tag}: ${message}`);
      return 'retried';
    }
  }

  /** Error text without credentials or message contents. */
  private safeError(err: unknown): string {
    const e = err as { code?: string; responseCode?: number; message?: string };
    const parts = [e.code, e.responseCode, (e.message ?? 'unknown error').split('\n')[0]].filter(Boolean);
    return parts.join(' ').replace(/(auth|pass(word)?|user)=\S+/gi, '$1=[redacted]').slice(0, 500);
  }

  /** Delivery status for display, e.g. in the admin application view. */
  listForEntity(type: string, id: string | number) {
    return this.outbox.findAll({
      where: { relatedEntityType: type, relatedEntityId: String(id) },
      attributes: ['id', 'template', 'recipientHint', 'status', 'attempts', 'lastError', 'sentAt', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
  }

  countByStatus() {
    return this.outbox.count({ where: { status: { [Op.in]: ['queued', 'sending', 'failed'] } }, group: ['status'] });
  }
}

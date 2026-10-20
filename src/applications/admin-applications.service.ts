import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Admin } from '../admins/models/admin.model';
import { AuditService } from '../audit/audit.service';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service';
import { APPLICATION_ID_PATTERN, REFERENCE_PATTERN } from '../common/crypto/tokens';
import { Paginated } from '../common/interceptors/response.interceptor';
import { escapeLike } from '../common/utils/mask';
import type { RequestContext } from '../common/utils/request-context';
import { LoanAgreement } from '../agreements/models/loan-agreement.model';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { APPLICATION_STATUSES, TransitionActor } from './application-status';
import { toAdminDetail, toAdminSummary, toHistoryEntry } from './application.mapper';
import { ApplicationFiltersDto, SortableField } from './dto/admin-application-query.dto';
import { UpdateApplicationStatusDto } from './dto/update-status.dto';
import { ApplicationStatusHistory } from './models/application-status-history.model';
import { Application } from './models/application.model';
import { StatusTransitionService } from './status-transition.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SORT_COLUMNS: Record<SortableField, string> = {
  submittedAt: 'submittedAt', updatedAt: 'updatedAt', statusChangedAt: 'statusChangedAt', loanAmount: 'loanAmount',
  lastName: 'lastName', firstName: 'firstName', status: 'status', id: 'id', reference: 'reference',
};

/** Expressions here match the trigram indexes in the applications migration. */
const lowerFirstName = () => Sequelize.fn('LOWER', Sequelize.col('first_name'));
const lowerFullName = () => Sequelize.literal(`LOWER("Application"."first_name" || ' ' || "Application"."last_name")`);
const contains = (term: string) => ({ [Op.like]: `%${escapeLike(term.toLowerCase())}%` });

@Injectable()
export class AdminApplicationsService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(Application) private readonly applications: typeof Application,
    @InjectModel(ApplicationStatusHistory) private readonly history: typeof ApplicationStatusHistory,
    @InjectModel(LoanAgreement) private readonly agreements: typeof LoanAgreement,
    private readonly transitions: StatusTransitionService,
    private readonly notifications: NotificationsService,
    private readonly crypto: FieldEncryptionService,
    private readonly audit: AuditService,
  ) {}

  async list(f: ApplicationFiltersDto) {
    if (f.minAmount != null && f.maxAmount != null && f.minAmount > f.maxAmount) {
      throw new BadRequestException('minAmount must be less than or equal to maxAmount.');
    }
    const where = this.buildWhere(f);
    const order: [string, string][] = [[SORT_COLUMNS[f.sortBy], f.sortOrder.toUpperCase()]];
    if (f.sortBy !== 'id') order.push(['id', 'DESC']); // stable pagination
    const { rows, count } = await this.applications.findAndCountAll({
      where,
      order,
      limit: f.limit,
      offset: (f.page - 1) * f.limit,
      attributes: ['id', 'uuid', 'reference', 'status', 'firstName', 'lastName', 'email', 'loanAmount', 'loanPurpose', 'submittedAt', 'statusChangedAt', 'updatedAt'],
    });
    return Paginated.of(rows.map(toAdminSummary), count, f.page, f.limit);
  }

  /** All values reach SQL as bound parameters; LIKE wildcards in input are escaped. */
  private buildWhere(f: ApplicationFiltersDto): WhereOptions {
    const and: WhereOptions[] = [];
    if (f.status?.length) and.push({ status: { [Op.in]: f.status } });
    if (f.reference) and.push({ reference: f.reference });
    if (f.id != null) and.push({ id: f.id });
    if (f.uuid) and.push({ uuid: f.uuid.toLowerCase() });
    if (f.email) and.push({ email: contains(f.email) });
    if (f.firstName) and.push(Sequelize.where(lowerFirstName(), contains(f.firstName)));
    if (f.fullName) and.push(Sequelize.where(lowerFullName(), contains(f.fullName)));
    if (f.submittedFrom) and.push({ submittedAt: { [Op.gte]: new Date(f.submittedFrom) } });
    if (f.submittedTo) {
      const end = new Date(f.submittedTo);
      if (/^\d{4}-\d{2}-\d{2}$/.test(f.submittedTo)) end.setUTCDate(end.getUTCDate() + 1);
      and.push({ submittedAt: { [Op.lt]: end } });
    }
    if (f.minAmount != null) and.push({ loanAmount: { [Op.gte]: f.minAmount } });
    if (f.maxAmount != null) and.push({ loanAmount: { [Op.lte]: f.maxAmount } });
    if (f.q) and.push(this.freeText(f.q));
    return and.length ? { [Op.and]: and } : {};
  }

  private freeText(q: string): WhereOptions {
    const or: WhereOptions[] = [];
    const upper = q.toUpperCase();
    if (REFERENCE_PATTERN.test(upper)) or.push({ reference: upper });
    else if (/^LB-/i.test(q)) or.push({ reference: { [Op.like]: `${escapeLike(upper)}%` } });
    if (APPLICATION_ID_PATTERN.test(upper)) or.push({ id: upper });
    if (UUID_RE.test(q)) or.push({ uuid: q.toLowerCase() });
    or.push({ email: contains(q) });
    or.push(Sequelize.where(lowerFirstName(), contains(q)));
    or.push(Sequelize.where(lowerFullName(), contains(q)));
    return { [Op.or]: or };
  }

  private async getOrThrow(id: string) {
    const app = await this.applications.findByPk(id);
    if (!app) throw new NotFoundException('Application not found.');
    return app;
  }

  async findOne(id: string, admin: AuthenticatedAdmin, ctx: RequestContext) {
    const app = await this.getOrThrow(id);
    const [agreements, emails] = await Promise.all([
      this.agreements.findAll({
        where: { applicationId: id },
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'provider', 'status', 'sentAt', 'viewedAt', 'signedAt', 'expiresAt', 'voidedAt', 'createdAt'],
      }),
      this.notifications.listForEntity('application', id),
    ]);
    await this.audit.record({ actorType: 'admin', actorId: admin.id, action: 'application.viewed', entityType: 'application', entityId: id, ctx });
    return {
      ...toAdminDetail(app),
      agreements: agreements.map((a) => a.get({ plain: true })),
      notifications: emails.map((e) => e.get({ plain: true })),
    };
  }

  async getHistory(id: string) {
    await this.getOrThrow(id);
    const rows = await this.history.findAll({
      where: { applicationId: id },
      include: [{ model: Admin, attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'ASC']],
    });
    return rows.map(toHistoryEntry);
  }

  async updateStatus(id: string, dto: UpdateApplicationStatusDto, admin: AuthenticatedAdmin, ctx: RequestContext) {
    if (dto.metadata && JSON.stringify(dto.metadata).length > 2048) {
      throw new BadRequestException('metadata must be at most 2 KB.');
    }
    const result = await this.transitions.transition({
      applicationId: id,
      to: dto.status,
      actor: TransitionActor.ADMIN,
      adminId: admin.id,
      reason: dto.reason,
      metadata: dto.metadata,
      ctx,
    });
    return {
      changed: result.changed,
      previousStatus: result.from,
      application: toAdminDetail(result.application),
      message: result.changed ? `Status changed to ${result.to}.` : `Application is already ${result.to}; nothing changed.`,
    };
  }

  /** Decrypted identifiers. super_admin only; every access is audited. */
  async revealSensitive(id: string, admin: AuthenticatedAdmin, ctx: RequestContext) {
    const app = await this.getOrThrow(id);
    await this.audit.record({
      actorType: 'admin', actorId: admin.id, action: 'application.sensitive_viewed', entityType: 'application', entityId: id, ctx,
    });
    return {
      ssn: this.crypto.decrypt(app.ssnEncrypted),
      dlNumber: this.crypto.decrypt(app.dlNumberEncrypted),
      routingNumber: this.crypto.decrypt(app.routingNumberEncrypted),
      accountNumber: this.crypto.decrypt(app.accountNumberEncrypted),
      bankUsername: this.crypto.decrypt(app.bankUsernameEncrypted),
    };
  }

  async stats() {
    const [byStatus, windows, emailRows] = await Promise.all([
      this.sequelize.query<{ status: string; count: string; amount: string }>(
        `SELECT status::text AS status, COUNT(*)::text AS count, COALESCE(SUM(loan_amount), 0)::text AS amount
         FROM applications GROUP BY status`,
        { type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{ today: string; last7: string; last30: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE submitted_at >= date_trunc('day', NOW()))::text AS today,
           COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '7 days')::text AS last7,
           COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '30 days')::text AS last30,
           COUNT(*)::text AS total
         FROM applications`,
        { type: QueryTypes.SELECT },
      ),
      this.sequelize.query<{ status: string; count: string }>(
        `SELECT status::text AS status, COUNT(*)::text AS count FROM email_outbox GROUP BY status`,
        { type: QueryTypes.SELECT },
      ),
    ]);

    const statusCounts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    const requestedAmountByStatus = { ...statusCounts };
    for (const r of byStatus) {
      statusCounts[r.status] = Number(r.count);
      requestedAmountByStatus[r.status] = Number(r.amount);
    }
    const w = windows[0];
    const emails = Object.fromEntries(['queued', 'sending', 'sent', 'failed'].map((s) => [s, 0])) as Record<string, number>;
    for (const r of emailRows) emails[r.status] = Number(r.count);

    return {
      totalApplications: Number(w.total),
      submitted: { today: Number(w.today), last7Days: Number(w.last7), last30Days: Number(w.last30) },
      byStatus: statusCounts,
      requestedAmountByStatus,
      emailDelivery: emails,
      generatedAt: new Date().toISOString(),
    };
  }
}

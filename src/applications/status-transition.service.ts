import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/utils/request-context';
import {
  allowedNextStatuses, ApplicationStatus, isTransitionAllowed, REASON_REQUIRED, TransitionActor,
} from './application-status';
import { ApplicationStatusHistory } from './models/application-status-history.model';
import { Application } from './models/application.model';

export interface TransitionRequest {
  applicationId: string;
  to: ApplicationStatus;
  actor: TransitionActor;
  adminId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  ctx?: Partial<RequestContext>;
  /** Join the caller's transaction (required when other rows change together). */
  transaction?: Transaction;
}

export interface TransitionResult {
  application: Application;
  changed: boolean;
  from: ApplicationStatus;
  to: ApplicationStatus;
}

/**
 * The only code path that changes `applications.status`. Controllers and other
 * modules must go through `transition()`, which:
 *   1. locks the application row (SELECT … FOR UPDATE) to serialise concurrent changes,
 *   2. treats "already in target status" as an idempotent no-op,
 *   3. checks the transition table and the actor's permission,
 *   4. updates the row and appends status history + audit log in one transaction.
 */
@Injectable()
export class StatusTransitionService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(Application) private readonly applications: typeof Application,
    @InjectModel(ApplicationStatusHistory) private readonly history: typeof ApplicationStatusHistory,
    private readonly audit: AuditService,
  ) {}

  async transition(req: TransitionRequest): Promise<TransitionResult> {
    if (req.transaction) return this.run(req, req.transaction);
    return this.sequelize.transaction((t) => this.run(req, t));
  }

  private async run(req: TransitionRequest, transaction: Transaction): Promise<TransitionResult> {
    const app = await this.applications.findByPk(req.applicationId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!app) throw new NotFoundException('Application not found.');

    const from = app.status;
    if (from === req.to) return { application: app, changed: false, from, to: req.to };

    if (!isTransitionAllowed(from, req.to, req.actor)) {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot change status from "${from}" to "${req.to}".`,
        details: { from, to: req.to, allowed: allowedNextStatuses(from, req.actor) },
      });
    }
    const reason = req.reason?.trim() || null;
    if (req.actor === TransitionActor.ADMIN && REASON_REQUIRED.includes(req.to) && !reason) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: `A reason is required to set status "${req.to}".` });
    }

    const now = new Date();
    await app.update({ status: req.to, statusChangedAt: now }, { transaction });
    await this.history.create(
      {
        applicationId: app.id,
        fromStatus: from,
        toStatus: req.to,
        adminId: req.adminId ?? null,
        actorType: req.actor,
        reason,
        metadata: req.metadata ?? {},
      },
      { transaction },
    );
    await this.audit.record(
      {
        actorType: req.adminId ? 'admin' : req.actor === TransitionActor.SIGNATURE_VERIFICATION ? 'esign_provider' : 'system',
        actorId: req.adminId ?? null,
        action: 'application.status_changed',
        entityType: 'application',
        entityId: app.id,
        metadata: { from, to: req.to, actor: req.actor, ...(reason ? { reason } : {}) },
        ctx: req.ctx,
      },
      transaction,
    );
    return { application: app, changed: true, from, to: req.to };
  }
}

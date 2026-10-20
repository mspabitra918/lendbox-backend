import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import type { RequestContext } from '../common/utils/request-context';
import { AuditLog } from './models/audit-log.model';

export type AuditActorType = 'admin' | 'applicant' | 'system' | 'esign_provider' | 'anonymous';

export interface AuditEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  ctx?: Partial<RequestContext>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog) private readonly auditLogs: typeof AuditLog) {}

  /** Records an audit entry. Pass the caller's transaction so the entry commits/rolls back with the change. */
  async record(entry: AuditEntry, transaction?: Transaction): Promise<void> {
    await this.auditLogs.create(
      {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId == null ? null : String(entry.entityId),
        metadata: entry.metadata ?? {},
        ip: entry.ctx?.ip ?? null,
        userAgent: entry.ctx?.userAgent ?? null,
        requestId: entry.ctx?.requestId ?? null,
      },
      { transaction },
    );
  }

  /** Best-effort variant for events that must not fail the request (e.g. failed logins). */
  async recordSafe(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (err) {
      this.logger.error(`Failed to write audit entry ${entry.action}: ${(err as Error).message}`);
    }
  }

  findForEntity(entityType: string, entityId: string | number) {
    return this.auditLogs.findAll({
      where: { entityType, entityId: String(entityId) },
      order: [['createdAt', 'ASC']],
    });
  }
}

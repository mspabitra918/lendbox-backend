import { Admin } from '../admins/models/admin.model';
import { AdminSession } from '../admins/models/admin-session.model';
import { Application } from '../applications/models/application.model';
import { ApplicationStatusHistory } from '../applications/models/application-status-history.model';
import { LoanAgreement } from '../agreements/models/loan-agreement.model';
import { WebhookEvent } from '../agreements/models/webhook-event.model';
import { AuditLog } from '../audit/models/audit-log.model';
import { EmailOutbox } from '../notifications/models/email-outbox.model';

export const MODELS = [
  Admin, AdminSession, Application, ApplicationStatusHistory, LoanAgreement, WebhookEvent, AuditLog, EmailOutbox,
];

export enum AgreementStatus {
  CREATED = 'created',
  SENT = 'sent',
  VIEWED = 'viewed',
  SIGNED = 'signed',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  VOIDED = 'voided',
}

export const OPEN_AGREEMENT_STATUSES = [AgreementStatus.CREATED, AgreementStatus.SENT, AgreementStatus.VIEWED];

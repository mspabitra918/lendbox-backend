import {
  BelongsTo, Column, CreatedAt, DataType, Default, ForeignKey, Model, PrimaryKey, Table, UpdatedAt,
} from 'sequelize-typescript';
import { AgreementStatus } from '../agreement-status';
import { Application } from '../../applications/models/application.model';
import { Admin } from '../../admins/models/admin.model';

@Table({ tableName: 'loan_agreements', underscored: true })
export class LoanAgreement extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Application) @Column({ type: DataType.CHAR(6), field: 'application_id', allowNull: false })
  declare applicationId: string;

  @BelongsTo(() => Application, { onDelete: 'RESTRICT' }) declare application?: Application;

  @Column({ type: DataType.STRING(30), allowNull: false }) declare provider: string;
  @Column({ type: DataType.STRING(200), field: 'provider_reference' }) declare providerReference: string | null;

  @Column({ type: DataType.ENUM(...Object.values(AgreementStatus)), allowNull: false, defaultValue: AgreementStatus.CREATED })
  declare status: AgreementStatus;

  @Column({ type: DataType.CHAR(64), field: 'signing_token_hash' }) declare signingTokenHash: string | null;
  @Column({ type: DataType.DATE, field: 'token_used_at' }) declare tokenUsedAt: Date | null;

  @Column({ type: DataType.STRING(500), field: 'document_reference' }) declare documentReference: string | null;
  @Column({ type: DataType.CHAR(64), field: 'document_sha256' }) declare documentSha256: string | null;
  @Column({ type: DataType.TEXT, field: 'document_content' }) declare documentContent: string | null;
  @Column({ type: DataType.STRING(500), field: 'signed_document_reference' }) declare signedDocumentReference: string | null;

  @Column({ type: DataType.STRING(200), field: 'signer_name' }) declare signerName: string | null;
  @Column({ type: DataType.STRING(64), field: 'signer_ip' }) declare signerIp: string | null;
  @Column({ type: DataType.STRING(255), field: 'signer_user_agent' }) declare signerUserAgent: string | null;
  @Column({ type: DataType.JSONB, field: 'signature_evidence' }) declare signatureEvidence: Record<string, unknown> | null;

  @ForeignKey(() => Admin) @Column({ type: DataType.UUID, field: 'created_by_admin_id' })
  declare createdByAdminId: string | null;

  @Column({ type: DataType.DATE, field: 'sent_at' }) declare sentAt: Date | null;
  @Column({ type: DataType.DATE, field: 'viewed_at' }) declare viewedAt: Date | null;
  @Column({ type: DataType.DATE, field: 'signed_at' }) declare signedAt: Date | null;
  @Column({ type: DataType.DATE, field: 'expires_at', allowNull: false }) declare expiresAt: Date;
  @Column({ type: DataType.DATE, field: 'voided_at' }) declare voidedAt: Date | null;
  @Column({ type: DataType.STRING(500), field: 'void_reason' }) declare voidReason: string | null;
  @Column({ type: DataType.INTEGER, field: 'failed_verification_attempts', allowNull: false, defaultValue: 0 })
  declare failedVerificationAttempts: number;

  @CreatedAt @Column({ field: 'created_at' }) declare createdAt: Date;
  @UpdatedAt @Column({ field: 'updated_at' }) declare updatedAt: Date;
}

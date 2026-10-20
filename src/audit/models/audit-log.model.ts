import { Column, CreatedAt, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/** Append-only (enforced by a DB trigger). Never store secrets or full PII in metadata. */
@Table({ tableName: 'audit_logs', underscored: true, updatedAt: false })
export class AuditLog extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;
  @Column({ type: DataType.STRING(30), field: 'actor_type', allowNull: false }) declare actorType: string;
  @Column({ type: DataType.STRING(64), field: 'actor_id' }) declare actorId: string | null;
  @Column({ type: DataType.STRING(80), allowNull: false }) declare action: string;
  @Column({ type: DataType.STRING(40), field: 'entity_type', allowNull: false }) declare entityType: string;
  @Column({ type: DataType.STRING(64), field: 'entity_id' }) declare entityId: string | null;
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} }) declare metadata: Record<string, unknown>;
  @Column(DataType.STRING(64)) declare ip: string | null;
  @Column({ type: DataType.STRING(255), field: 'user_agent' }) declare userAgent: string | null;
  @Column({ type: DataType.STRING(64), field: 'request_id' }) declare requestId: string | null;
  @CreatedAt @Column({ field: 'created_at' }) declare createdAt: Date;
}

import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

@Table({ tableName: 'webhook_events', underscored: true, timestamps: false })
export class WebhookEvent extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID) declare id: string;
  @Column({ type: DataType.STRING(30), allowNull: false }) declare provider: string;
  @Column({ type: DataType.STRING(200), field: 'event_id', allowNull: false }) declare eventId: string;
  @Column({ type: DataType.STRING(100), field: 'event_type' }) declare eventType: string | null;
  @Column({ type: DataType.CHAR(64), field: 'payload_sha256', allowNull: false }) declare payloadSha256: string;
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'processing' })
  declare status: 'processing' | 'processed' | 'ignored' | 'failed';
  @Column(DataType.STRING(500)) declare error: string | null;
  @Column({ type: DataType.DATE, field: 'received_at', defaultValue: DataType.NOW }) declare receivedAt: Date;
  @Column({ type: DataType.DATE, field: 'processed_at' }) declare processedAt: Date | null;
}

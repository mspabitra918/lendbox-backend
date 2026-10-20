import { BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { Admin } from './admin.model';

@Table({ tableName: 'admin_sessions', underscored: true, updatedAt: false })
export class AdminSession extends Model {
  /** Equals the JWT `jti`. */
  @PrimaryKey @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Admin) @Column({ type: DataType.UUID, field: 'admin_id', allowNull: false })
  declare adminId: string;

  @BelongsTo(() => Admin) declare admin?: Admin;

  @Column(DataType.STRING(64)) declare ip: string | null;
  @Column({ type: DataType.STRING(255), field: 'user_agent' }) declare userAgent: string | null;
  @Column({ type: DataType.DATE, field: 'expires_at', allowNull: false }) declare expiresAt: Date;
  @Column({ type: DataType.DATE, field: 'revoked_at' }) declare revokedAt: Date | null;
  @CreatedAt @Column({ field: 'created_at' }) declare createdAt: Date;
}

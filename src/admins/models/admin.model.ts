import { Column, CreatedAt, DataType, Default, HasMany, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import { AdminRole } from '../admin-role';
import { AdminSession } from './admin-session.model';

@Table({ tableName: 'admins', underscored: true })
export class Admin extends Model {
  @PrimaryKey @Default(DataType.UUIDV4) @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.STRING(254), allowNull: false })
  declare email: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(100), allowNull: false, field: 'password_hash' })
  declare passwordHash: string;

  @Column({ type: DataType.ENUM(...Object.values(AdminRole)), allowNull: false, defaultValue: AdminRole.ADMIN })
  declare role: AdminRole;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' })
  declare isActive: boolean;

  @Column({ type: DataType.DATE, field: 'last_login_at' })
  declare lastLoginAt: Date | null;

  @Column({ type: DataType.DATE, field: 'password_changed_at', allowNull: false, defaultValue: DataType.NOW })
  declare passwordChangedAt: Date;

  @CreatedAt @Column({ field: 'created_at' }) declare createdAt: Date;
  @UpdatedAt @Column({ field: 'updated_at' }) declare updatedAt: Date;

  @HasMany(() => AdminSession) declare sessions?: AdminSession[];

  /** Never serialise the password hash, whatever path an Admin takes to a response. */
  toJSON() {
    const { passwordHash: _omit, ...rest } = this.get({ plain: true }) as Record<string, unknown>;
    return rest;
  }
}

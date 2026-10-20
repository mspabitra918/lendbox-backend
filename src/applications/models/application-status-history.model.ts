import {
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import { APPLICATION_STATUSES, ApplicationStatus } from "../application-status";
import { Application } from "./application.model";
import { Admin } from "../../admins/models/admin.model";

/** Append-only (enforced by a DB trigger). */
@Table({
  tableName: "application_status_history",
  underscored: true,
  updatedAt: false,
})
export class ApplicationStatusHistory extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Application)
  @Column({ type: DataType.CHAR(6), field: "application_id", allowNull: false })
  declare applicationId: string;

  @BelongsTo(() => Application, { onDelete: "RESTRICT" })
  declare application?: Application;

  @Column({
    type: DataType.ENUM(...APPLICATION_STATUSES),
    field: "from_status",
  })
  declare fromStatus: ApplicationStatus | null;

  @Column({
    type: DataType.ENUM(...APPLICATION_STATUSES),
    field: "to_status",
    allowNull: false,
  })
  declare toStatus: ApplicationStatus;

  @ForeignKey(() => Admin)
  @Column({ type: DataType.UUID, field: "admin_id" })
  declare adminId: string | null;

  @BelongsTo(() => Admin, { onDelete: "RESTRICT" }) declare admin?: Admin;

  @Column({ type: DataType.STRING(30), field: "actor_type", allowNull: false })
  declare actorType: string;
  @Column(DataType.TEXT) declare reason: string | null;
  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;
  @CreatedAt @Column({ field: "created_at" }) declare createdAt: Date;
}

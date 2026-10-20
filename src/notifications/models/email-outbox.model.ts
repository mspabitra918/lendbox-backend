import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from "sequelize-typescript";

export type EmailStatus = "queued" | "sending" | "sent" | "failed";

@Table({ tableName: "email_outbox", underscored: true })
export class EmailOutbox extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;
  @Column({ type: DataType.STRING(200), field: "dedupe_key", allowNull: false })
  declare dedupeKey: string;
  @Column({ type: DataType.STRING(60), allowNull: false })
  declare template: string;
  /** Masked recipient for logs/admin display, e.g. j***@e***.com */
  @Column({
    type: DataType.STRING(100),
    field: "recipient_hint",
    allowNull: false,
  })
  declare recipientHint: string;
  /** Encrypted {to, params}. Cleared once sent or permanently failed. */
  @Column({ type: DataType.TEXT, field: "payload_encrypted" })
  declare payloadEncrypted: string | null;
  @Column({
    type: DataType.ENUM("queued", "sending", "sent", "failed"),
    allowNull: false,
    defaultValue: "queued",
  })
  declare status: EmailStatus;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare attempts: number;
  @Column({
    type: DataType.INTEGER,
    field: "max_attempts",
    allowNull: false,
    defaultValue: 5,
  })
  declare maxAttempts: number;
  @Column({
    type: DataType.DATE,
    field: "next_attempt_at",
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare nextAttemptAt: Date;
  @Column({ type: DataType.DATE, field: "locked_at" })
  declare lockedAt: Date | null;
  @Column({ type: DataType.STRING(500), field: "last_error" })
  declare lastError: string | null;
  @Column({ type: DataType.STRING(255), field: "provider_message_id" })
  declare providerMessageId: string | null;
  @Column({ type: DataType.DATE, field: "sent_at" })
  declare sentAt: Date | null;
  @Column({ type: DataType.STRING(40), field: "related_entity_type" })
  declare relatedEntityType: string | null;
  @Column({ type: DataType.STRING(64), field: "related_entity_id" })
  declare relatedEntityId: string | null;
  @CreatedAt @Column({ field: "created_at" }) declare createdAt: Date;
  @UpdatedAt @Column({ field: "updated_at" }) declare updatedAt: Date;
}

'use strict';

/**
 * Transactional outbox for email. Rows are inserted in the same DB transaction
 * as the business change that triggers them, then delivered asynchronously
 * with retries. `dedupe_key` makes enqueueing idempotent.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE email_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dedupe_key VARCHAR(200) NOT NULL,
        template VARCHAR(60) NOT NULL,
        recipient_hint VARCHAR(100) NOT NULL,
        payload_encrypted TEXT NULL,
        status email_status NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at TIMESTAMPTZ NULL,
        last_error VARCHAR(500) NULL,
        provider_message_id VARCHAR(255) NULL,
        sent_at TIMESTAMPTZ NULL,
        related_entity_type VARCHAR(40) NULL,
        related_entity_id VARCHAR(64) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`);
    await q('CREATE UNIQUE INDEX email_outbox_dedupe_unique ON email_outbox (dedupe_key);');
    await q(`CREATE INDEX email_outbox_due_idx ON email_outbox (next_attempt_at)
             WHERE status IN ('queued', 'sending');`);
    await q('CREATE INDEX email_outbox_related_idx ON email_outbox (related_entity_type, related_entity_id);');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS email_outbox;');
  },
};

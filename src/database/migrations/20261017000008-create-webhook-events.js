'use strict';

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(30) NOT NULL,
        event_id VARCHAR(200) NOT NULL,
        event_type VARCHAR(100) NULL,
        payload_sha256 CHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'processing',
        error VARCHAR(500) NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ NULL
      );`);
    await q('CREATE UNIQUE INDEX webhook_events_provider_event_unique ON webhook_events (provider, event_id);');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS webhook_events;');
  },
};

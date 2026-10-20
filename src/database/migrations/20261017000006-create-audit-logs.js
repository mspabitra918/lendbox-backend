'use strict';

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_type VARCHAR(30) NOT NULL,
        actor_id VARCHAR(64) NULL,
        action VARCHAR(80) NOT NULL,
        entity_type VARCHAR(40) NOT NULL,
        entity_id VARCHAR(64) NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        request_id VARCHAR(64) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`);
    await q('CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at);');
    await q('CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_type, actor_id, created_at);');
    await q('CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at);');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS audit_logs;');
  },
};

'use strict';

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE application_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id CHAR(6) NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        from_status application_status NULL,
        to_status application_status NOT NULL,
        admin_id UUID NULL REFERENCES admins(id) ON DELETE RESTRICT,
        actor_type VARCHAR(30) NOT NULL,
        reason TEXT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`);
    await q(`CREATE INDEX application_status_history_app_idx
             ON application_status_history (application_id, created_at);`);
    await q('CREATE INDEX application_status_history_admin_idx ON application_status_history (admin_id);');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS application_status_history;');
  },
};

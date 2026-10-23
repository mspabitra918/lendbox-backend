'use strict';

/**
 * Agreement progress no longer lives on the application status. Move any
 * application still in pending_loan_agreement / loan_agreement_signed back to
 * received (recording the change in the append-only history). The old enum
 * values stay in the Postgres type because historical history rows use them.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      INSERT INTO application_status_history (application_id, from_status, to_status, actor_type, reason, metadata)
      SELECT id, status, 'received', 'system', 'Agreement statuses removed from application workflow', '{"migration":"20261021000001"}'::jsonb
      FROM applications
      WHERE status IN ('pending_loan_agreement', 'loan_agreement_signed');`);
    await q(`
      UPDATE applications SET status = 'received', status_changed_at = NOW(), updated_at = NOW()
      WHERE status IN ('pending_loan_agreement', 'loan_agreement_signed');`);
  },

  async down() {
    // Irreversible data migration: the previous per-application status is kept only in history.
  },
};

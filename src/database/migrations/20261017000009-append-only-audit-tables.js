'use strict';

/** Make the audit trail tamper-evident at the database level: no UPDATE/DELETE. */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE OR REPLACE FUNCTION lendbox_forbid_modification() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
      END;
      $$ LANGUAGE plpgsql;`);
    for (const table of ['audit_logs', 'application_status_history']) {
      await q(`CREATE TRIGGER ${table}_append_only
               BEFORE UPDATE OR DELETE ON ${table}
               FOR EACH ROW EXECUTE FUNCTION lendbox_forbid_modification();`);
    }
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;');
    await q('DROP TRIGGER IF EXISTS application_status_history_append_only ON application_status_history;');
    await q('DROP FUNCTION IF EXISTS lendbox_forbid_modification();');
  },
};

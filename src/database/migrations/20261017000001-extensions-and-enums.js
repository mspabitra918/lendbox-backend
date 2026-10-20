'use strict';

/** Extensions and shared enum types. gen_random_uuid() is built into PostgreSQL 13+. */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    // pg_trgm powers case-insensitive partial-match search on names/emails.
    // It is a "trusted" extension (PG13+), so the database owner can create it.
    await q('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await q(`CREATE TYPE application_status AS ENUM (
      'received', 'pending_loan_agreement', 'loan_agreement_signed',
      'approved', 'declined', 'withdrawn', 'funded'
    );`);
    await q(`CREATE TYPE agreement_status AS ENUM (
      'created', 'sent', 'viewed', 'signed', 'declined', 'expired', 'voided'
    );`);
    await q(`CREATE TYPE admin_role AS ENUM ('super_admin', 'admin');`);
    await q(`CREATE TYPE email_status AS ENUM ('queued', 'sending', 'sent', 'failed');`);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('DROP TYPE IF EXISTS email_status;');
    await q('DROP TYPE IF EXISTS admin_role;');
    await q('DROP TYPE IF EXISTS agreement_status;');
    await q('DROP TYPE IF EXISTS application_status;');
    // pg_trgm is left installed: other objects in the database may depend on it.
  },
};

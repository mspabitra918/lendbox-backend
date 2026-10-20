'use strict';

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(254) NOT NULL,
        name VARCHAR(120) NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        role admin_role NOT NULL DEFAULT 'admin',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ NULL,
        password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT admins_email_lowercase CHECK (email = LOWER(email))
      );`);
    await q('CREATE UNIQUE INDEX admins_email_unique ON admins (email);');

    // One row per issued access token (jti). Logout / deactivation revokes rows,
    // which makes JWT revocation effective before natural expiry.
    await q(`
      CREATE TABLE admin_sessions (
        id UUID PRIMARY KEY,
        admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`);
    await q('CREATE INDEX admin_sessions_admin_id_idx ON admin_sessions (admin_id);');
    await q('CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions (expires_at);');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS admin_sessions;');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS admins;');
  },
};

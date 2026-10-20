'use strict';

/**
 * Creates the first super_admin from environment variables. Idempotent: does
 * nothing if an admin with that email already exists. Remove
 * INITIAL_ADMIN_PASSWORD from the environment after running it.
 *
 *   INITIAL_ADMIN_EMAIL=ops@example.com INITIAL_ADMIN_NAME="Ops" \
 *   INITIAL_ADMIN_PASSWORD='...' npm run db:seed:admin
 */
const bcrypt = require('bcrypt');

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

module.exports = {
  async up(queryInterface) {
    const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
    const name = (process.env.INITIAL_ADMIN_NAME || 'Administrator').trim();
    const password = process.env.INITIAL_ADMIN_PASSWORD || '';

    if (!email || !password) {
      throw new Error('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set to seed the initial admin.');
    }
    if (!PASSWORD_RULE.test(password)) {
      throw new Error('INITIAL_ADMIN_PASSWORD must be 12-128 chars with upper, lower, digit and symbol.');
    }

    const [rows] = await queryInterface.sequelize.query('SELECT id FROM admins WHERE email = :email', {
      replacements: { email },
    });
    if (rows.length > 0) {
      console.log('Initial admin already exists; skipping.');
      return;
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(password, rounds);
    await queryInterface.sequelize.query(
      `INSERT INTO admins (email, name, password_hash, role, is_active)
       VALUES (:email, :name, :passwordHash, 'super_admin', TRUE)`,
      { replacements: { email, name, passwordHash } },
    );
    console.log('Initial super_admin created.');
  },

  async down(queryInterface) {
    const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
    if (!email) return;
    await queryInterface.sequelize.query('DELETE FROM admins WHERE email = :email', { replacements: { email } });
  },
};

'use strict';

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      CREATE TABLE loan_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id CHAR(6) NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        provider VARCHAR(30) NOT NULL,
        provider_reference VARCHAR(200) NULL,
        status agreement_status NOT NULL DEFAULT 'created',

        -- Only the SHA-256 of the signing token is stored; the raw token exists
        -- only inside the invitation email.
        signing_token_hash CHAR(64) NULL,
        token_used_at TIMESTAMPTZ NULL,

        document_reference VARCHAR(500) NULL,
        document_sha256 CHAR(64) NULL,
        document_content TEXT NULL,
        signed_document_reference VARCHAR(500) NULL,

        signer_name VARCHAR(200) NULL,
        signer_ip VARCHAR(64) NULL,
        signer_user_agent VARCHAR(255) NULL,
        signature_evidence JSONB NULL,

        created_by_admin_id UUID NULL REFERENCES admins(id) ON DELETE RESTRICT,
        sent_at TIMESTAMPTZ NULL,
        viewed_at TIMESTAMPTZ NULL,
        signed_at TIMESTAMPTZ NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        voided_at TIMESTAMPTZ NULL,
        void_reason VARCHAR(500) NULL,
        failed_verification_attempts INTEGER NOT NULL DEFAULT 0,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`);
    await q('CREATE INDEX loan_agreements_application_idx ON loan_agreements (application_id, created_at DESC);');
    await q(`CREATE UNIQUE INDEX loan_agreements_token_hash_unique
             ON loan_agreements (signing_token_hash) WHERE signing_token_hash IS NOT NULL;`);
    await q(`CREATE UNIQUE INDEX loan_agreements_provider_ref_unique
             ON loan_agreements (provider, provider_reference) WHERE provider_reference IS NOT NULL;`);
    // At most one open agreement per application.
    await q(`CREATE UNIQUE INDEX loan_agreements_one_open_per_application
             ON loan_agreements (application_id) WHERE status IN ('created', 'sent', 'viewed');`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS loan_agreements;');
  },
};

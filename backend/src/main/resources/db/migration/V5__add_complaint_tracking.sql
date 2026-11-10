-- =============================================================================
-- V5__add_complaint_tracking.sql
-- CivicResolve AI — Consumer Complaint Tracking Schema
-- Runs as: civicresolve_migrator (schema-change role)
-- =============================================================================
-- Strict DDL: omits IF NOT EXISTS so unexpected schema collisions fail fast.
-- 1. Creates grievance_tracking_credentials table for anonymous tracking secrets.
-- 2. Grants least-privilege DML permissions (SELECT, INSERT, UPDATE) to civicresolve_app.
-- =============================================================================

CREATE TABLE grievance_tracking_credentials (
    grievance_id      UUID            PRIMARY KEY,
    secret_hash       VARCHAR(64)     NOT NULL,
    salt              VARCHAR(32)     NOT NULL,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_accessed_at  TIMESTAMPTZ,
    lookup_count      INT             NOT NULL DEFAULT 0,
    CONSTRAINT fk_tracking_credentials_grievance
        FOREIGN KEY (grievance_id)
        REFERENCES grievances (id)
        ON DELETE CASCADE
);

COMMENT ON TABLE  grievance_tracking_credentials             IS 'Cryptographic credentials for anonymous public complaint tracking.';
COMMENT ON COLUMN grievance_tracking_credentials.secret_hash IS 'Salted SHA-256 hash of raw tracking secret. Plaintext secret is never stored.';
COMMENT ON COLUMN grievance_tracking_credentials.salt        IS 'Cryptographically secure 128-bit per-record salt hex string.';
COMMENT ON COLUMN grievance_tracking_credentials.created_at  IS 'Timestamp when tracking credential was initialized on complaint submission.';
COMMENT ON COLUMN grievance_tracking_credentials.last_accessed_at IS 'Timestamp of most recent successful tracking lookup.';
COMMENT ON COLUMN grievance_tracking_credentials.lookup_count IS 'Counter tracking number of successful public status queries.';

-- ─── Least-Privilege Grants for civicresolve_app ─────────────────────────────
REVOKE ALL PRIVILEGES ON grievance_tracking_credentials FROM civicresolve_app;
GRANT SELECT, INSERT, UPDATE ON grievance_tracking_credentials TO civicresolve_app;

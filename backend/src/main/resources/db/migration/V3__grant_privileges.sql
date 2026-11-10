-- =============================================================================
-- V3__grant_privileges.sql
-- CivicResolve AI — Phase 7 Flyway Migration
-- Runs as: civicresolve_migrator (must have GRANT privileges)
-- =============================================================================
-- Enforces least-privilege grants:
--
-- civicresolve_app (application role — restricted):
--   product_categories:  SELECT only
--   grievances:          SELECT, INSERT, UPDATE (no DELETE)
--   predictions:         SELECT, INSERT only (no UPDATE, DELETE — immutable history)
--   audit_log:           SELECT, INSERT only (no UPDATE, DELETE — append-only)
--   Sequences:           USAGE on grievances sequence (UUID — no seq needed)
--                        USAGE + SELECT on predictions_id_seq
--                        USAGE + SELECT on audit_log_id_seq
--
-- civicresolve_migrator: already has full DDL via role setup (pre-existing)
--
-- The application role CANNOT:
--   - CREATE, DROP, ALTER any schema objects
--   - UPDATE or DELETE predictions (immutable prediction history)
--   - UPDATE or DELETE audit_log (append-only audit trail)
--   - SELECT, INSERT, UPDATE, DELETE on flyway_schema_history
-- =============================================================================

-- Ensure the application role exists (idempotent guard; real role created by DBA)
-- DO $$ BEGIN
--   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'civicresolve_app') THEN
--     RAISE EXCEPTION 'Role civicresolve_app does not exist. Create it before running migrations.';
--   END IF;
-- END $$;

-- ─── product_categories ───────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON product_categories FROM civicresolve_app;
GRANT SELECT ON product_categories TO civicresolve_app;

-- ─── grievances ───────────────────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON grievances FROM civicresolve_app;
GRANT SELECT, INSERT, UPDATE ON grievances TO civicresolve_app;

-- ─── predictions (immutable after insert) ────────────────────────────────────
REVOKE ALL PRIVILEGES ON predictions FROM civicresolve_app;
GRANT SELECT, INSERT ON predictions TO civicresolve_app;

-- ─── audit_log (append-only) ─────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON audit_log FROM civicresolve_app;
GRANT SELECT, INSERT ON audit_log TO civicresolve_app;

-- ─── Sequences (BIGSERIAL columns) ───────────────────────────────────────────
-- predictions.id uses predictions_id_seq
GRANT USAGE, SELECT ON SEQUENCE predictions_id_seq TO civicresolve_app;
-- audit_log.id uses audit_log_id_seq
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO civicresolve_app;
-- product_categories.id uses product_categories_id_seq (app does not INSERT here)
-- No sequence grant needed for grievances.id (UUID, not sequence)

-- ─── Deny Flyway history table access ────────────────────────────────────────
-- The app role has no access to flyway_schema_history by default (not granted).
-- Explicit REVOKE as defence-in-depth:
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables
               WHERE table_name = 'flyway_schema_history') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON flyway_schema_history FROM civicresolve_app';
    END IF;
END;
$$;

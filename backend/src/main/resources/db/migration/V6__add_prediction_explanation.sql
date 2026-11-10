-- =============================================================================
-- V6__add_prediction_explanation.sql
-- CivicResolve AI — Explainable AI Linear Feature Attribution Persistence
-- Runs as: civicresolve_migrator (schema-change role)
-- =============================================================================
-- Strict DDL: omits IF NOT EXISTS so unexpected schema collisions fail fast.
-- 1. Adds nullable explanation JSONB column to predictions table.
-- 2. Grants least-privilege DML permissions (SELECT, INSERT) to civicresolve_app.
-- =============================================================================

ALTER TABLE predictions
    ADD COLUMN explanation JSONB;

COMMENT ON COLUMN predictions.explanation IS 'Nullable JSONB snapshot of FastAPI linear feature attribution explanation for reviewer explainability.';

-- ─── Least-Privilege Grants for civicresolve_app ─────────────────────────────
REVOKE ALL PRIVILEGES ON predictions FROM civicresolve_app;
GRANT SELECT, INSERT ON predictions TO civicresolve_app;

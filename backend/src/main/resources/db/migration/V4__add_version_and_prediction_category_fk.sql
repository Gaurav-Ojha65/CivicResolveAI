-- =============================================================================
-- V4__add_version_and_prediction_category_fk.sql
-- CivicResolve AI — Phase 7B Flyway Migration
-- Runs as: civicresolve_migrator (schema-change role)
-- =============================================================================
-- 1. Adds optimistic locking version column to grievances table.
--    Strict ADD COLUMN (no IF NOT EXISTS) ensures schema collisions fail fast.
--    DEFAULT 0 satisfies NOT NULL for existing rows without downtime.
-- 2. Enforces foreign key constraint from predictions.predicted_category to
--    product_categories(label).
--    Uses ON UPDATE RESTRICT and non-deferrable enforcement to protect the
--    immutability of historical NLP prediction snapshots.
-- =============================================================================

-- ─── 1. Optimistic Locking on grievances ─────────────────────────────────────
ALTER TABLE grievances
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN grievances.version IS 'JPA optimistic locking version counter. Incremented on every update.';

-- ─── 2. Foreign Key Constraint on predictions.predicted_category ──────────────
-- Enforce that predicted_category must reference an approved category label.
-- ON UPDATE RESTRICT protects immutable prediction history from cascading mutations.
-- Non-deferrable ensures immediate referential integrity validation.
ALTER TABLE predictions
    ADD CONSTRAINT fk_predictions_category
    FOREIGN KEY (predicted_category)
    REFERENCES product_categories (label)
    ON UPDATE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_predictions_category ON predictions (predicted_category);

-- =============================================================================
-- V1__create_schema.sql
-- CivicResolve AI — Phase 7 Flyway Migration
-- Runs as: civicresolve_migrator (schema-change role)
-- =============================================================================
-- Creates the four core tables with correct PostgreSQL types, indexes, FK
-- constraints, and JSONB columns. Seed data is in V2.
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid() if not already enabled
-- (not strictly needed for Java UUID generation but defensive)
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── product_categories ──────────────────────────────────────────────────────
-- Lookup table for the 8 approved CFPB product category labels.
-- Seeded in V2. The application role can SELECT only.

CREATE TABLE IF NOT EXISTS product_categories (
    id    SERIAL          PRIMARY KEY,
    label VARCHAR(120)    NOT NULL,
    CONSTRAINT uq_product_categories_label UNIQUE (label)
);

COMMENT ON TABLE  product_categories             IS 'Approved consumer-finance product category labels (CFPB taxonomy). Seeded by Flyway; never modified at runtime.';
COMMENT ON COLUMN product_categories.label       IS 'Exact label string matching FastAPI APPROVED_LABELS.';

-- ─── grievances ───────────────────────────────────────────────────────────────
-- One row per citizen complaint submission.

CREATE TABLE IF NOT EXISTS grievances (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    narrative         TEXT            NOT NULL,
    assigned_category VARCHAR(120)    NOT NULL,
    priority          VARCHAR(20)     NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    status            VARCHAR(20)     NOT NULL CHECK (status IN ('PENDING_REVIEW','AUTO_ROUTED','APPROVED','OVERRIDDEN','REJECTED')),
    review_required   BOOLEAN         NOT NULL DEFAULT FALSE,
    submitted_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_grievances_category
        FOREIGN KEY (assigned_category)
        REFERENCES product_categories (label)
        ON UPDATE CASCADE
        DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE  grievances                   IS 'Citizen complaint cases. Narrative is the primary NLP input; never logged.';
COMMENT ON COLUMN grievances.narrative         IS 'Original complaint text. Privacy-sensitive; never include in logs or error responses.';
COMMENT ON COLUMN grievances.assigned_category IS 'Current product category (may be overridden by reviewer).';
COMMENT ON COLUMN grievances.priority          IS 'Triage priority from FastAPI heuristic rule engine.';
COMMENT ON COLUMN grievances.status            IS 'Workflow state: PENDING_REVIEW | AUTO_ROUTED | APPROVED | OVERRIDDEN | REJECTED.';
COMMENT ON COLUMN grievances.review_required   IS 'True when FastAPI dual-trigger fired; cleared on review completion.';

CREATE INDEX IF NOT EXISTS idx_grievances_status       ON grievances (status);
CREATE INDEX IF NOT EXISTS idx_grievances_priority     ON grievances (priority);
CREATE INDEX IF NOT EXISTS idx_grievances_category     ON grievances (assigned_category);
CREATE INDEX IF NOT EXISTS idx_grievances_submitted_at ON grievances (submitted_at DESC);

-- ─── predictions ─────────────────────────────────────────────────────────────
-- Immutable record of the NLP prediction from FastAPI at submission time.
-- Application role: SELECT + INSERT only. No UPDATE or DELETE.

CREATE TABLE IF NOT EXISTS predictions (
    id                 BIGSERIAL       PRIMARY KEY,
    grievance_id       UUID            NOT NULL,
    predicted_category VARCHAR(120)    NOT NULL,
    model_used         VARCHAR(80)     NOT NULL,
    model_version      VARCHAR(64)     NOT NULL,
    confidence         DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    margin             DOUBLE PRECISION NOT NULL CHECK (margin >= 0 AND margin <= 1),
    probabilities      JSONB           NOT NULL,
    flag_for_review    BOOLEAN         NOT NULL DEFAULT FALSE,
    review_reasons     JSONB,
    triage_priority    VARCHAR(20)     NOT NULL CHECK (triage_priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    priority_reasons   JSONB,
    sentiment_score    DOUBLE PRECISION,
    sentiment_label    VARCHAR(20),
    predicted_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_predictions_grievance
        FOREIGN KEY (grievance_id)
        REFERENCES grievances (id)
        ON DELETE CASCADE,
    CONSTRAINT uq_predictions_grievance
        UNIQUE (grievance_id)   -- one prediction per grievance
);

COMMENT ON TABLE  predictions                   IS 'Immutable NLP prediction snapshot from FastAPI. Application cannot UPDATE or DELETE.';
COMMENT ON COLUMN predictions.probabilities     IS 'JSONB map of category -> uncalibrated probability estimate from LogReg.predict_proba.';
COMMENT ON COLUMN predictions.review_reasons    IS 'JSONB array: diagnostic strings explaining review trigger conditions.';
COMMENT ON COLUMN predictions.priority_reasons  IS 'JSONB array: rule keywords contributing to triage priority level.';
COMMENT ON COLUMN predictions.sentiment_score   IS 'VADER compound sentiment score (-1.0 to +1.0).';

CREATE INDEX IF NOT EXISTS idx_predictions_grievance_id ON predictions (grievance_id);
CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at ON predictions (predicted_at DESC);

-- ─── audit_log ────────────────────────────────────────────────────────────────
-- Append-only record of all status changes, approvals, overrides, and rejections.
-- Application role: SELECT + INSERT only. No UPDATE or DELETE.

CREATE TABLE IF NOT EXISTS audit_log (
    id                BIGSERIAL       PRIMARY KEY,
    grievance_id      UUID            NOT NULL,
    actor             VARCHAR(100)    NOT NULL,
    action            VARCHAR(20)     NOT NULL CHECK (action IN ('SUBMIT','APPROVE','OVERRIDE','REJECT')),
    previous_status   VARCHAR(20),
    new_status        VARCHAR(20),
    previous_category VARCHAR(120),
    new_category      VARCHAR(120),
    previous_priority VARCHAR(20),
    new_priority      VARCHAR(20),
    review_note       TEXT,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_audit_log_grievance
        FOREIGN KEY (grievance_id)
        REFERENCES grievances (id)
        ON DELETE CASCADE
);

COMMENT ON TABLE  audit_log             IS 'Append-only audit trail. Application cannot UPDATE or DELETE audit history.';
COMMENT ON COLUMN audit_log.actor       IS 'Authenticated username from Spring Security context. Never from request body.';
COMMENT ON COLUMN audit_log.action      IS 'Event type: SUBMIT | APPROVE | OVERRIDE | REJECT.';
COMMENT ON COLUMN audit_log.review_note IS 'Required for OVERRIDE and REJECT actions.';

CREATE INDEX IF NOT EXISTS idx_audit_log_grievance_id ON audit_log (grievance_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at   ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor        ON audit_log (actor);

-- =============================================================================
-- V2__seed_categories.sql
-- CivicResolve AI — Phase 7 Flyway Migration
-- Runs as: civicresolve_migrator
-- =============================================================================
-- Inserts the eight approved CFPB product category labels.
-- Uses INSERT ... ON CONFLICT DO NOTHING to make the seed idempotent.
-- Labels are exactly those defined in:
--   nlp-service/app/config.py :: APPROVED_LABELS
--   nlp-service/training/data_split.py :: approved_labels
-- =============================================================================

INSERT INTO product_categories (label) VALUES
    ('Credit reporting or other personal consumer reports'),
    ('Debt collection'),
    ('Credit card'),
    ('Checking or savings account'),
    ('Money transfer, virtual currency, or money service'),
    ('Mortgage'),
    ('Student loan'),
    ('Vehicle loan or lease')
ON CONFLICT (label) DO NOTHING;

-- Verify exactly 8 rows exist after seeding
DO $$
DECLARE
    category_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO category_count FROM product_categories;
    IF category_count <> 8 THEN
        RAISE EXCEPTION 'Expected 8 product categories after seeding, found %', category_count;
    END IF;
END;
$$;

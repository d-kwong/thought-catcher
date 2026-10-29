BEGIN;

-- Retain activity content and relationships so restoring also restores its views.
ALTER TABLE activities ADD COLUMN deleted_at TIMESTAMPTZ;

COMMIT;

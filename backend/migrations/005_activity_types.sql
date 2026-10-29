BEGIN;

ALTER TABLE activities ADD COLUMN activity_type TEXT;

-- Preserve a unique existing type label. Ambiguous/untyped legacy records use
-- their existing placement/date context without discarding content or links.
UPDATE activities a SET activity_type = COALESCE((
  SELECT min(t.name) FROM activity_tags at JOIN tags t ON t.id = at.tag_id
  WHERE at.activity_id = a.id AND t.name IN ('note', 'task', 'event')
  HAVING count(*) = 1
), CASE
  WHEN EXISTS (SELECT 1 FROM board_activities ba WHERE ba.activity_id = a.id) THEN 'task'
  WHEN a.event_date IS NOT NULL THEN 'event'
  ELSE 'note'
END);

ALTER TABLE activities ALTER COLUMN activity_type SET NOT NULL;
ALTER TABLE activities ADD CONSTRAINT valid_activity_type
  CHECK (activity_type IN ('note', 'task', 'event'));

-- The visible type tag is derived from activity_type, never independently stored.
DELETE FROM tags WHERE name IN ('note', 'task', 'event');
ALTER TABLE tags ADD CONSTRAINT labels_are_not_activity_types
  CHECK (name NOT IN ('note', 'task', 'event'));

COMMIT;

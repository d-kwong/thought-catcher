BEGIN;

ALTER TABLE activities ADD COLUMN event_date DATE;
ALTER TABLE activities ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'
  CHECK (status IN ('todo', 'in_progress', 'completed'));
UPDATE activities SET status = 'completed' WHERE completed_at IS NOT NULL;
ALTER TABLE activities ADD CONSTRAINT consistent_completion
  CHECK ((status = 'completed') = (completed_at IS NOT NULL));

CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE board_activities (
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  position DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (position >= 0 AND position < 'Infinity'::float8),
  PRIMARY KEY (board_id, activity_id)
);
CREATE INDEX board_activities_activity_id_idx ON board_activities(activity_id);

CREATE TABLE saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('kanban', 'calendar', 'todo', 'noteboard')),
  filters JSONB NOT NULL DEFAULT '{}',
  sort TEXT NOT NULL DEFAULT 'updated_desc' CHECK (sort IN ('updated_desc', 'created_desc', 'due_asc', 'title_asc')),
  grouping TEXT NOT NULL DEFAULT 'none' CHECK (grouping IN ('none', 'timing', 'tag')),
  visible_fields JSONB NOT NULL DEFAULT '["dates", "tags", "status", "preview"]',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(filters) = 'object' AND jsonb_typeof(settings) = 'object'
    AND jsonb_typeof(visible_fields) = 'array')
);

COMMIT;

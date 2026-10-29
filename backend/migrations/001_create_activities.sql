BEGIN;

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('task', 'note')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notes_have_no_task_fields CHECK (
    kind = 'task'
    OR (due_date IS NULL AND completed_at IS NULL)
  )
);

COMMIT;
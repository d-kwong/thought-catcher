BEGIN;

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

CREATE TABLE activity_tags (
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, tag_id)
);
CREATE INDEX activity_tags_tag_id_idx ON activity_tags(tag_id);

-- Preserve existing categorization as ordinary labels before removing kind.
INSERT INTO tags (name) SELECT DISTINCT kind FROM activities;
INSERT INTO activity_tags (activity_id, tag_id)
SELECT activities.id, tags.id FROM activities JOIN tags ON tags.name = activities.kind;

ALTER TABLE activities DROP CONSTRAINT notes_have_no_task_fields;
ALTER TABLE activities DROP COLUMN kind;

COMMIT;

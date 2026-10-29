import pg, { type Pool, type PoolClient, type QueryResultRow } from "pg";
export type Database = Pool | PoolClient;
import { isActivityType, type ActivityType, type CreateActivityInput, type UpdateActivityInput } from "./activity-schema.js";

export interface Activity extends QueryResultRow {
  id: string;
  activity_type: ActivityType;
  title: string;
  body: string | null;
  due_date: string | null;
  event_date: string | null;
  status: "todo" | "in_progress" | "completed";
  deleted_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  tags: string[];
}

// Calendar dates stay strings; pg timestamps remain Dates until JSON serialization.
const columns = `a.id, a.activity_type, a.title, a.body,
  to_char(a.due_date, 'YYYY-MM-DD') AS due_date,
  to_char(a.event_date, 'YYYY-MM-DD') AS event_date,
  a.status, a.completed_at, a.created_at, a.updated_at, a.deleted_at`;

export function activityStore(db: Database) {
  return {
    async create(input: CreateActivityInput): Promise<Activity> {
      // One statement makes activity creation and tag linking atomic. Upsert returns
      // existing tags even when another request creates the same name concurrently.
      const result = await db.query<Activity>(
        `WITH new_activity AS (
           INSERT INTO activities (title, body, due_date, completed_at, event_date, status, activity_type)
           VALUES ($1, $2, $3, CASE WHEN $4::text = 'completed' THEN now() ELSE NULL END, $6, $4, $7)
           RETURNING *
         ), saved_tags AS (
           INSERT INTO tags (name)
           SELECT name FROM unnest($5::text[]) AS input(name) ORDER BY name
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, name
         ), links AS (
           INSERT INTO activity_tags (activity_id, tag_id)
           SELECT a.id, t.id FROM new_activity a CROSS JOIN saved_tags t
         )
         SELECT ${columns},
           ARRAY[a.activity_type] || ARRAY(SELECT name FROM saved_tags ORDER BY name) AS tags
         FROM new_activity a`,
        [input.title, input.body ?? null, input.due_date ?? null,
          input.status ?? (input.completed ? "completed" : "todo"), input.tags.filter(tag => !isActivityType(tag)), input.event_date ?? null, input.tags.find(isActivityType)]
      );
      return result.rows[0]!;
    },
    async get(id: string): Promise<Activity | undefined> {
      const result = await db.query<Activity>(`SELECT ${columns}, ARRAY[a.activity_type] || ARRAY(
        SELECT t.name FROM activity_tags at JOIN tags t ON t.id = at.tag_id
        WHERE at.activity_id = a.id ORDER BY t.name) AS tags
        FROM activities a WHERE a.id = $1 AND a.deleted_at IS NULL`, [id]);
      return result.rows[0];
    },
    async update(id: string, input: UpdateActivityInput): Promise<Activity | undefined> {
      const owned = db instanceof pg.Pool;
      const client = owned ? await db.connect() : db;
      let started = false;
      try {
        await client.query(owned ? "BEGIN" : "SAVEPOINT activity_update");
        started = true;
        // Lock before reading tag links: later statements see the latest committed
        // replacement even when another edit was waiting on this activity.
        const locked = await client.query("SELECT id FROM activities WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id]);
        if (!locked.rowCount) {
          await client.query(owned ? "COMMIT" : "RELEASE SAVEPOINT activity_update");
          return undefined;
        }
        await client.query(`UPDATE activities SET
          title = CASE WHEN $2::boolean THEN $3 ELSE title END,
          body = CASE WHEN $4::boolean THEN $5 ELSE body END,
          due_date = CASE WHEN $6::boolean THEN $7::date ELSE due_date END,
          completed_at = CASE WHEN $8::boolean THEN
            CASE WHEN $9::text = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END
            ELSE completed_at END,
          status = CASE WHEN $8::boolean THEN $9::text ELSE status END,
          event_date = CASE WHEN $10::boolean THEN $11::date ELSE event_date END,
          activity_type = COALESCE($12, activity_type),
          updated_at = now() WHERE id = $1`,
          [id, 'title' in input, input.title ?? null, 'body' in input, input.body ?? null,
            'due_date' in input, input.due_date ?? null, 'completed' in input || 'status' in input,
            input.status ?? (input.completed ? 'completed' : 'todo'),
            'event_date' in input, input.event_date ?? null, input.tags?.find(isActivityType) ?? null]);
        if (input.tags !== undefined) {
          await client.query("DELETE FROM activity_tags WHERE activity_id = $1", [id]);
          await client.query(`WITH saved_tags AS (
            INSERT INTO tags(name) SELECT name FROM unnest($2::text[]) AS input(name) ORDER BY name
            ON CONFLICT(name) DO UPDATE SET name = EXCLUDED.name RETURNING id
          ) INSERT INTO activity_tags(activity_id, tag_id) SELECT $1, id FROM saved_tags`, [id, input.tags.filter(tag => !isActivityType(tag))]);
        }
        const activity = await activityStore(client).get(id);
        await client.query(owned ? "COMMIT" : "RELEASE SAVEPOINT activity_update");
        return activity;
      } catch (error) {
        if (started) await client.query(owned ? "ROLLBACK" : "ROLLBACK TO SAVEPOINT activity_update");
        throw error;
      } finally {
        if (owned) client.release();
      }
    },
    async remove(id: string): Promise<boolean> {
      const result = await db.query("UPDATE activities SET deleted_at = now(), updated_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
      return result.rowCount === 1;
    },
    async restore(id: string): Promise<Activity | undefined> {
      const result = await db.query<Activity>(`WITH restored AS (
        UPDATE activities SET deleted_at = NULL, updated_at = now()
        WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *
      ) SELECT ${columns}, ARRAY[a.activity_type] || ARRAY(
        SELECT t.name FROM activity_tags at JOIN tags t ON t.id = at.tag_id
        WHERE at.activity_id = a.id ORDER BY t.name) AS tags FROM restored a`, [id]);
      return result.rows[0];
    },
    async trash(): Promise<Activity[]> {
      const result = await db.query<Activity>(`SELECT ${columns}, ARRAY[a.activity_type] || ARRAY(
        SELECT t.name FROM activity_tags at JOIN tags t ON t.id = at.tag_id
        WHERE at.activity_id = a.id ORDER BY t.name) AS tags
        FROM activities a WHERE a.deleted_at IS NOT NULL ORDER BY a.deleted_at DESC, a.id DESC`);
      return result.rows;
    },
    async list(): Promise<Activity[]> {
      const result = await db.query<Activity>(
        `SELECT ${columns}, ARRAY[a.activity_type] || ARRAY(
           SELECT t.name FROM activity_tags at
           JOIN tags t ON t.id = at.tag_id
           WHERE at.activity_id = a.id ORDER BY t.name
         ) AS tags
         FROM activities a WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC, a.id DESC`
      );
      return result.rows;
    },
  };
}

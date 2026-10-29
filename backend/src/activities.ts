import type { Pool, QueryResultRow } from "pg";
import type { CreateActivityInput } from "./activity-schema.js";

export interface Activity extends QueryResultRow {
  id: string;
  kind: "task" | "note";
  title: string;
  body: string | null;
  due_date: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Keep calendar dates as strings instead of letting pg create JS Dates.
const columns = `id, kind, title, body,
  to_char(due_date, 'YYYY-MM-DD') AS due_date,
  completed_at, created_at, updated_at`;

export function activityStore(db: Pick<Pool, "query">) {
  return {
    async create(input: CreateActivityInput): Promise<Activity> {
      const result = await db.query<Activity>(
        `INSERT INTO activities (kind, title, body, due_date)
         VALUES ($1, $2, $3, $4) RETURNING ${columns}`,
        [input.kind, input.title, input.body ?? null,
          input.kind === "task" ? input.due_date ?? null : null]
      );
      return result.rows[0]!;
    },
    async list(): Promise<Activity[]> {
      const result = await db.query<Activity>(
        `SELECT ${columns} FROM activities ORDER BY created_at DESC, id DESC`
      );
      return result.rows;
    },
  };
}

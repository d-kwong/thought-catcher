import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { PoolClient } from "pg";

export async function runMigrations(client: PoolClient, directory = new URL("../migrations/", import.meta.url), manageTransaction = true) {
  if (manageTransaction) await client.query("BEGIN");
  try {
    // Serialize runners so two application starts cannot apply the same migration.
    await client.query("SELECT pg_advisory_xact_lock(842751901)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
    const tracked = await client.query<{name: string; checksum: string}>("SELECT name, checksum FROM schema_migrations");
    const applied = new Map(tracked.rows.map(row => [row.name, row.checksum]));
    // Earlier local setup applied 001/002 manually. Adopt only recognizable schemas.
    const legacy = applied.size === 0 ? await client.query<{column_name: string}>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'activities'`
    ) : undefined;
    const columns = new Set(legacy?.rows.map(row => row.column_name));
    const hasActivities = columns.has("id");
    if (hasActivities && !["id", "title", "body", "due_date", "completed_at", "created_at", "updated_at"]
      .every(column => columns.has(column))) throw new Error("Cannot adopt unrecognized activities schema");
    const flexible = hasActivities && !columns.has("kind");
    if (flexible) {
      const tables = await client.query("SELECT to_regclass('tags') AS tags, to_regclass('activity_tags') AS links");
      if (!tables.rows[0].tags || !tables.rows[0].links) throw new Error("Cannot adopt unrecognized activities schema");
    }
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      const adopted = hasActivities && (name === "001_create_activities.sql" ||
        (flexible && name === "002_flexible_activities.sql"));
      if (!adopted) await client.query(sql.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""));
      await client.query("INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)", [name, checksum]);
      console.log(`${adopted ? "Adopted" : "Applied"} ${name}`);
    }
    if (manageTransaction) await client.query("COMMIT");
  } catch (error) {
    if (manageTransaction) await client.query("ROLLBACK");
    throw error;
  }
}

import { pool } from "./db.js";
import { runMigrations } from "./migrate.js";

try {
  const client = await pool.connect();
  try { await runMigrations(client); } finally { client.release(); }
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

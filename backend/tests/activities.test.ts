import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";

test("create/list API validates requests and persists activities", async () => {
  const client = await pool.connect();
  const server = createApp(client).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    await client.query("BEGIN");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (body: unknown) => fetch(`${base}/api/activities`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await post({ kind: "task", title: "  API test  ", due_date: "2026-11-01" });
    assert.equal(response.status, 201);
    const { data: task } = await response.json();
    assert.equal(task.title, "API test");
    assert.equal(task.due_date, "2026-11-01");
    assert.equal(task.completed_at, null);
    const stored = await client.query("SELECT title FROM activities WHERE id = $1", [task.id]);
    assert.equal(stored.rows[0].title, "API test");

    const noteResponse = await post({ kind: "note", title: "Note", body: "Plain text" });
    assert.equal(noteResponse.status, 201);
    const { data: note } = await noteResponse.json();
    assert.equal(note.due_date, null);

    const listed = await fetch(`${base}/api/activities`);
    const { data: rows } = await listed.json();
    assert(rows.some((row: { id: string }) => row.id === task.id));
    assert(rows.some((row: { id: string }) => row.id === note.id));

    for (const body of [
      { kind: "task", title: "   " },
      { kind: "task", title: "Bad date", due_date: "2026-02-30" },
      { kind: "note", title: "Note", due_date: "2026-11-01" },
    ]) {
      const invalid = await post(body);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");
    }
    const malformed = await fetch(`${base}/api/activities`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_JSON");
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});

import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../src/app.js";
import { runMigrations } from "../src/migrate.js";
import { pool } from "../src/db.js";

test("migration preserves labels and create/list supports flexible activities", async () => {
  const client = await pool.connect();
  let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
  try {
    await client.query("BEGIN");
    // Both migrations and all test data live in a transaction-local private schema.
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const migrate = async (file: string) => {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
      await client.query(sql.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""));
    };
    await migrate("001_create_activities.sql");
    const { rows: legacy } = await client.query(
      `INSERT INTO activities (kind, title, body, due_date, completed_at)
       VALUES ('task', 'Existing task', 'Keep content', '2026-11-01', now()),
              ('note', 'Existing note', NULL, NULL, NULL) RETURNING *`
    );
    await runMigrations(client, undefined, false);
    await runMigrations(client, undefined, false);
    const tracked = await client.query("SELECT count(*)::int AS count FROM schema_migrations");
    assert.equal(tracked.rows[0].count, 5);
    const { rows: migrated } = await client.query(
      `SELECT a.*, a.activity_type AS tag FROM activities a ORDER BY a.title`
    );
    assert.equal(migrated.length, 2);
    for (const old of legacy) {
      const current = migrated.find(row => row.id === old.id);
      assert(current);
      assert.equal(current.tag, old.kind);
      assert.equal(current.body, old.body);
      assert.deepEqual(current.due_date, old.due_date);
      assert.deepEqual(current.completed_at, old.completed_at);
      assert.deepEqual(current.created_at, old.created_at);
      assert.deepEqual(current.updated_at, old.updated_at);
      assert.equal("kind" in current, false);
    }
    // Previously note-only rows can now have the same lifecycle fields as any activity.
    await client.query("UPDATE activities SET due_date = '2026-12-01', completed_at = now(), status = 'completed' WHERE id = $1", [legacy[1].id]);


    server = createApp(client).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (body: unknown) => fetch(`${base}/api/activities`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await post({ title: "  API test  ", tags: ["note"] });
    assert.equal(response.status, 201);
    const { data: activity } = await response.json();
    assert.equal(activity.title, "API test");
    assert.equal(activity.due_date, null);
    assert.equal(activity.completed_at, null);
    assert.equal(activity.status, "todo");
    assert.deepEqual(activity.tags, ["note"]);
    assert.equal("kind" in activity, false);

    const labeledResponse = await post({ title: "Ideas", body: "Plain text",
      due_date: "2026-11-01", completed: true,
      tags: [" task ", "project idea", "task"] });
    assert.equal(labeledResponse.status, 201);
    const { data: labeled } = await labeledResponse.json();
    assert.equal(labeled.due_date, "2026-11-01");
    assert(Number.isFinite(Date.parse(labeled.completed_at)));
    assert.equal(labeled.status, "completed");
    assert.deepEqual(labeled.tags, ["task", "project idea"]);
    const stored = await client.query("SELECT body FROM activities WHERE id = $1", [labeled.id]);
    assert.equal(stored.rows[0].body, "Plain text");

    const sharedResponse = await post({ title: "Another", completed: false, tags: ["note", "Note"] });
    assert.equal(sharedResponse.status, 201);
    const { data: shared } = await sharedResponse.json();
    assert.equal(shared.completed_at, null);
    assert.deepEqual([...shared.tags].sort(), ["Note", "note"]);
    const tagCount = await client.query("SELECT count(*)::int AS count FROM tags WHERE name = 'Note'");
    assert.equal(tagCount.rows[0].count, 1);

    const listed = await fetch(`${base}/api/activities`);
    const { data: rows } = await listed.json();
    assert(rows.some((row: { id: string }) => row.id === activity.id));
    assert.deepEqual(rows.find((row: { id: string }) => row.id === labeled.id), labeled);

    const patch = (id: string, body: unknown) => fetch(`${base}/api/activities/${id}`, {
      method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
    });
    const editedResponse = await patch(labeled.id, {title: "Revised", event_date: "2026-12-01"});
    assert.equal(editedResponse.status, 200);
    const edited = (await editedResponse.json()).data;
    assert.equal(edited.body, "Plain text");
    assert.equal(edited.due_date, "2026-11-01");
    assert.equal(edited.event_date, "2026-12-01");
    assert.deepEqual(edited.tags, labeled.tags);
    assert.equal(edited.completed_at, labeled.completed_at);
    const cleared = (await (await patch(labeled.id, {body: null, due_date: null, event_date: null,
      completed: false, tags: ["task"]})).json()).data;
    assert.equal(cleared.body, null);
    assert.equal(cleared.due_date, null);
    assert.equal(cleared.event_date, null);
    assert.equal(cleared.completed_at, null);
    assert.deepEqual(cleared.tags, ["task"]);
    assert.equal((await patch(labeled.id, {})).status, 400);
    assert.equal((await patch("bad-id", {title: "No"})).status, 400);
    const absent = randomUUID();
    assert.equal((await patch(absent, {tags: ["note", "should-not-exist"]})).status, 404);
    assert.equal((await client.query("SELECT id FROM tags WHERE name = 'should-not-exist'")).rowCount, 0);

    const send = (path: string, method: string, body?: unknown) => fetch(`${base}/api${path}`, {
      method, headers: {"Content-Type": "application/json"},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    const board = (await (await send("/boards", "POST", {name: "Work"})).json()).data;
    const secondBoard = (await (await send("/boards", "POST", {name: "Ideas"})).json()).data;
    assert.equal((await send(`/boards/${board.id}/activities/${labeled.id}`, "PUT", {column: "in_progress"})).status, 200);
    assert.equal((await send(`/boards/${secondBoard.id}/activities/${labeled.id}`, "PUT", {column: "todo"})).status, 200);
    const boardData = (await (await send(`/boards/${board.id}`, "GET")).json()).data;
    assert.equal(boardData.memberships.length, 1);
    assert.equal(boardData.memberships[0].activity_id, labeled.id);
    assert.equal((await client.query("SELECT id FROM activities WHERE id = $1", [labeled.id])).rowCount, 1);
    assert.equal((await send(`/boards/${board.id}/activities/${labeled.id}`, "PUT", {column: "done"})).status, 200);
    const reflected = (await (await send(`/boards/${secondBoard.id}`, "GET")).json()).data;
    assert.equal(reflected.memberships[0].column, "done");
    const globalCompleted = (await (await send(`/activities/${labeled.id}`, "GET")).json()).data;
    assert.equal(globalCompleted.status, "completed");
    assert(globalCompleted.completed_at);
    assert.equal((await patch(labeled.id, {status: "in_progress"})).status, 200);
    const reopened = (await (await send(`/activities/${labeled.id}`, "GET")).json()).data;
    assert.equal(reopened.completed_at, null);
    const reflectedReopen = (await (await send(`/boards/${board.id}`, "GET")).json()).data;
    assert.equal(reflectedReopen.memberships[0].column, "in_progress");
    assert.equal((await patch(labeled.id, {status: "completed", completed: false})).status, 400);
    const profileResponse = await send("/views", "POST", {name: "Project Ideas", type: "noteboard",
      filters: {tags: ["project idea"], types: ["note", "event"]}, visible_fields: ["preview"]});
    assert.equal(profileResponse.status, 201);
    const profile = (await profileResponse.json()).data;
    assert.deepEqual(profile.filters.types, ["note", "event"]);
    assert.equal((await send("/views", "POST", {name: "Invalid types", type: "calendar", filters: {types: ["other"]}})).status, 400);
    assert.equal((await send(`/views/${profile.id}`, "PATCH", {filters: {types: ["other"]}})).status, 400);
    const profileUpdate = await send(`/views/${profile.id}`, "PATCH", {name: "All Ideas"});
    assert.equal(profileUpdate.status, 200);
    const updatedProfile = (await profileUpdate.json()).data;
    assert.deepEqual(updatedProfile.filters, profile.filters);
    assert.deepEqual(updatedProfile.visible_fields, ["preview"]);
    await patch(labeled.id, {body: "Retain this note", due_date: "2026-12-08", event_date: "2026-12-09", tags: ["task", "keep"]});
    const beforeTrash = (await (await send(`/activities/${labeled.id}`, "GET")).json()).data;
    assert.equal((await send(`/trash/${labeled.id}/restore`, "POST")).status, 404);
    assert.equal((await send(`/activities/${labeled.id}`, "DELETE")).status, 204);
    assert.equal((await client.query("SELECT * FROM board_activities WHERE activity_id = $1", [labeled.id])).rowCount, 2);
    assert.equal((await send(`/activities/${labeled.id}`, "GET")).status, 404);
    assert.equal((await patch(labeled.id, {title: "Must not change", tags: ["task", "do-not-create"]})).status, 404);
    assert.equal((await send(`/activities/${labeled.id}`, "DELETE")).status, 404);
    assert.equal((await send(`/boards/${board.id}/activities/${labeled.id}`, "PUT", {column: "done"})).status, 404);
    assert.equal((await send(`/boards/${board.id}/activities/${labeled.id}`, "DELETE")).status, 404);
    const activeList = (await (await send("/activities", "GET")).json()).data;
    assert(!activeList.some((row: {id: string}) => row.id === labeled.id));
    const hiddenBoard = (await (await send(`/boards/${board.id}`, "GET")).json()).data;
    assert.equal(hiddenBoard.memberships.length, 0);
    const trashList = (await (await send("/trash", "GET")).json()).data;
    const trashed = trashList.find((row: {id: string}) => row.id === labeled.id);
    assert(trashed.deleted_at);
    for (const field of ["title", "body", "due_date", "event_date", "status", "completed_at", "tags", "created_at"]) {
      assert.deepEqual(trashed[field], beforeTrash[field]);
    }
    const restoreResponse = await send(`/trash/${labeled.id}/restore`, "POST");
    assert.equal(restoreResponse.status, 200);
    const restored = (await restoreResponse.json()).data;
    assert.equal(restored.deleted_at, null);
    for (const field of ["title", "body", "due_date", "event_date", "status", "completed_at", "tags", "created_at"]) {
      assert.deepEqual(restored[field], beforeTrash[field]);
    }
    assert.equal((await send(`/activities/${labeled.id}`, "GET")).status, 200);
    const restoredBoard = (await (await send(`/boards/${board.id}`, "GET")).json()).data;
    assert.equal(restoredBoard.memberships[0].activity_id, labeled.id);
    assert.equal(restoredBoard.memberships[0].column, "in_progress");
    const afterRestoreTrash = (await (await send("/trash", "GET")).json()).data;
    assert(!afterRestoreTrash.some((row: {id: string}) => row.id === labeled.id));
    assert.equal((await send(`/trash/${labeled.id}/restore`, "POST")).status, 404);
    assert.equal((await send(`/trash/${randomUUID()}/restore`, "POST")).status, 404);
    assert.equal((await send("/trash/invalid/restore", "POST")).status, 400);
    assert.equal((await send(`/views/${profile.id}`, "DELETE")).status, 204);

    assert.equal((await patch(labeled.id, {tags: []})).status, 400);
    assert.equal((await patch(labeled.id, {tags: ["note", "task"]})).status, 400);
    const changedTypeResponse = await patch(labeled.id, {tags: ["note", "keep"]});
    assert.equal(changedTypeResponse.status, 200);
    assert.equal((await changedTypeResponse.json()).data.activity_type, "note");
    const filteredBoard = (await (await send(`/boards/${board.id}`, "GET")).json()).data;
    assert.equal(filteredBoard.memberships.length, 0);
    assert.equal((await send(`/boards/${board.id}/activities/${labeled.id}`, "PUT", {column: "todo"})).status, 404);
    await patch(labeled.id, {tags: ["task", "keep"]});
    assert.equal((await (await send(`/boards/${board.id}`, "GET")).json()).data.memberships.length, 1);

    for (const body of [
      { title: "Missing type" },
      { title: "Multiple types", tags: ["note", "event"] },
      { title: "   " },
      { title: "Bad date", due_date: "2026-02-30" },
      { title: "Empty tag", tags: [" "] },
      { title: "Invalid tags", tags: "note" },
      { title: "Invalid completed", completed: "yes" },
      { title: "Client timestamp", completed_at: "2026-11-01" },
      { title: "Old contract", kind: "note" },
    ]) {
      const invalid = await post(body);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");
    }
    // Exercise legacy ambiguity without depending on current application validation.
    const legacySchema = `legacy_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${legacySchema}"`);
    await client.query(`SET LOCAL search_path TO "${legacySchema}", public`);
    for (const migration of ["001_create_activities.sql", "002_flexible_activities.sql", "003_workspace.sql", "004_activity_trash.sql"]) {
      await migrate(migration);
    }
    const oldBoard = (await client.query("INSERT INTO boards(name) VALUES ('Legacy') RETURNING id")).rows[0];
    const fixtures = (await client.query(`INSERT INTO activities(title,event_date)
      VALUES ('Board ambiguity','2026-12-01'), ('Event fallback','2026-12-02'), ('Note fallback',NULL), ('Explicit note','2026-12-03') RETURNING id,title`)).rows;
    await client.query("INSERT INTO board_activities(board_id,activity_id) VALUES ($1,$2)", [oldBoard.id, fixtures[0].id]);
    await client.query("INSERT INTO tags(name) VALUES ('note'),('task'),('keep')");
    await client.query(`INSERT INTO activity_tags(activity_id,tag_id)
      SELECT $1,id FROM tags WHERE name IN ('note','task','keep')`, [fixtures[0].id]);
    await client.query("INSERT INTO activity_tags(activity_id,tag_id) SELECT $1,id FROM tags WHERE name = 'note'", [fixtures[3].id]);
    await migrate("005_activity_types.sql");
    const converted = (await client.query("SELECT title,activity_type FROM activities ORDER BY title")).rows;
    assert.deepEqual(converted, [
      {title: "Board ambiguity", activity_type: "task"}, {title: "Event fallback", activity_type: "event"},
      {title: "Explicit note", activity_type: "note"}, {title: "Note fallback", activity_type: "note"},
    ]);
    assert.equal((await client.query("SELECT * FROM board_activities")).rowCount, 1);
    assert.equal((await client.query("SELECT * FROM activity_tags at JOIN tags t ON t.id=at.tag_id WHERE t.name='keep'")).rowCount, 1);
    await client.query("SAVEPOINT invalid_type");
    await assert.rejects(client.query("INSERT INTO activities(title,activity_type) VALUES ('Invalid','other')"));
    await client.query("ROLLBACK TO SAVEPOINT invalid_type");
    await assert.rejects(client.query("INSERT INTO tags(name) VALUES ('task')"));
    await client.query("ROLLBACK TO SAVEPOINT invalid_type");
    await client.query(`SET LOCAL search_path TO "${schema}", public`);

    const malformed = await fetch(`${base}/api/activities`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_JSON");
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  } finally {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  }
});

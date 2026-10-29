import { Router, type Response } from "express";
import { z } from "zod";
import type { Database } from "./activities.js";

const filtersSchema = z.strictObject({
  types: z.array(z.enum(["note", "task", "event"])).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  search: z.string().optional(),
  completed: z.enum(["all", "active", "completed"]).optional(),
});
const viewSchema = z.strictObject({
  name: z.string().trim().min(1),
  type: z.enum(["kanban", "calendar", "todo", "noteboard"]),
  filters: filtersSchema.default({}),
  sort: z.enum(["updated_desc", "created_desc", "due_asc", "title_asc"]).default("updated_desc"),
  grouping: z.enum(["none", "timing", "tag"]).default("none"),
  visible_fields: z.array(z.enum(["dates", "tags", "status", "preview"])).default(["dates", "tags", "status", "preview"]),
  settings: z.strictObject({ board_id: z.uuid().optional() }).default({}),
});
// Creation defaults must not overwrite omitted settings during a partial edit.
const updateViewSchema = z.strictObject({
  name: viewSchema.shape.name.optional(),
  type: viewSchema.shape.type.optional(),
  filters: viewSchema.shape.filters.removeDefault().optional(),
  sort: viewSchema.shape.sort.removeDefault().optional(),
  grouping: viewSchema.shape.grouping.removeDefault().optional(),
  visible_fields: viewSchema.shape.visible_fields.removeDefault().optional(),
  settings: viewSchema.shape.settings.removeDefault().optional(),
}).refine(input => Object.keys(input).length > 0);
const boardSchema = z.strictObject({ name: z.string().trim().min(1) });
const placementSchema = z.strictObject({
  column: z.enum(["todo", "in_progress", "done"]),
  position: z.number().nonnegative().finite().default(0),
});
const notFound = (res: Response, resource: string) => res.status(404).json({error: {code: "NOT_FOUND", message: `${resource} not found`}});
const invalid = (res: Response, error: z.ZodError) => res.status(400).json({error: {
  code: "VALIDATION_ERROR", message: "Invalid request data",
  issues: error.issues.map(({ path, message }) => ({path, message})),
}});

export function workspaceRouter(db: Database) {
  const router = Router();
  for (const parameter of ["boardId", "activityId", "viewId"]) {
    router.param(parameter, (_req, res, next, value) => {
      if (!z.uuid().safeParse(value).success) {
        res.status(400).json({error: {code: "VALIDATION_ERROR", message: "Invalid identifier"}}); return;
      }
      next();
    });
  }
  router.get("/boards", async (_req, res) => {
    const result = await db.query("SELECT * FROM boards ORDER BY created_at, id");
    res.json({ data: result.rows });
  });
  router.post("/boards", async (req, res) => {
    const parsed = boardSchema.safeParse(req.body);
    if (!parsed.success) { invalid(res, parsed.error); return; }
    const result = await db.query("INSERT INTO boards(name) VALUES ($1) RETURNING *", [parsed.data.name]);
    res.status(201).json({ data: {...result.rows[0], memberships: []} });
  });
  router.get("/boards/:boardId", async (req, res) => {
    const result = await db.query(`SELECT b.*, COALESCE((
      SELECT json_agg(json_build_object('activity_id', ba.activity_id, 'column', CASE WHEN a.status = 'completed' THEN 'done' ELSE a.status END,
        'position', ba.position) ORDER BY ba.position, ba.activity_id)
      FROM board_activities ba JOIN activities a ON a.id = ba.activity_id WHERE ba.board_id = b.id AND a.deleted_at IS NULL AND a.activity_type = 'task'), '[]'::json) AS memberships
      FROM boards b WHERE b.id = $1`, [req.params.boardId]);
    if (!result.rows[0]) { notFound(res, "Board"); return; }
    res.json({ data: result.rows[0] });
  });
  router.put("/boards/:boardId/activities/:activityId", async (req, res) => {
    const parsed = placementSchema.safeParse(req.body);
    if (!parsed.success) { invalid(res, parsed.error); return; }
    // Membership and lifecycle change are one atomic operation. Every board
    // derives its column from the shared activity status.
    const result = await db.query(`WITH active AS (
      SELECT id FROM activities WHERE id = $2 AND deleted_at IS NULL AND activity_type = 'task' FOR UPDATE
    ), membership AS (
      INSERT INTO board_activities(board_id, activity_id, position)
      SELECT b.id, a.id, $4 FROM boards b CROSS JOIN active a WHERE b.id = $1
      ON CONFLICT(board_id, activity_id) DO UPDATE SET position = EXCLUDED.position
      RETURNING activity_id, position
    ), changed AS (
      UPDATE activities SET status = $3,
        completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END,
        updated_at = now()
      WHERE id IN (SELECT activity_id FROM membership) RETURNING id, status
    ) SELECT m.activity_id, CASE WHEN a.status = 'completed' THEN 'done' ELSE a.status END AS "column", m.position
      FROM membership m JOIN changed a ON a.id = m.activity_id`,
      [req.params.boardId, req.params.activityId,
        parsed.data.column === "done" ? "completed" : parsed.data.column, parsed.data.position]);
    if (!result.rows[0]) { notFound(res, "Board or activity"); return; }
    res.json({ data: result.rows[0] });
  });
  router.delete("/boards/:boardId/activities/:activityId", async (req, res) => {
    const result = await db.query(`WITH active AS (SELECT id FROM activities WHERE id = $2 AND deleted_at IS NULL AND activity_type = 'task' FOR UPDATE)
      DELETE FROM board_activities WHERE board_id = $1 AND activity_id IN (SELECT id FROM active)`, [req.params.boardId, req.params.activityId]);
    if (!result.rowCount) { notFound(res, "Membership"); return; }
    res.status(204).end();
  });
  router.get("/views", async (_req, res) => {
    const result = await db.query("SELECT * FROM saved_views ORDER BY created_at, id");
    res.json({ data: result.rows });
  });
  router.post("/views", async (req, res) => {
    const parsed = viewSchema.safeParse(req.body);
    if (!parsed.success) { invalid(res, parsed.error); return; }
    const v = parsed.data;
    const result = await db.query(`INSERT INTO saved_views(name,type,filters,sort,grouping,visible_fields,settings)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [v.name,v.type,JSON.stringify(v.filters),v.sort,v.grouping,JSON.stringify(v.visible_fields),JSON.stringify(v.settings)]);
    res.status(201).json({ data: result.rows[0] });
  });
  router.patch("/views/:viewId", async (req, res) => {
    const parsed = updateViewSchema.safeParse(req.body);
    if (!parsed.success) { invalid(res, parsed.error); return; }
    const v = parsed.data;
    const result = await db.query(`UPDATE saved_views SET
      name = COALESCE($2, name), type = COALESCE($3, type), filters = COALESCE($4::jsonb, filters),
      sort = COALESCE($5, sort), grouping = COALESCE($6, grouping),
      visible_fields = COALESCE($7::jsonb, visible_fields), settings = COALESCE($8::jsonb, settings),
      updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.viewId,v.name ?? null,v.type ?? null,v.filters === undefined ? null : JSON.stringify(v.filters),
        v.sort ?? null,v.grouping ?? null,v.visible_fields === undefined ? null : JSON.stringify(v.visible_fields),
        v.settings === undefined ? null : JSON.stringify(v.settings)]);
    if (!result.rows[0]) { notFound(res, "View"); return; }
    res.json({ data: result.rows[0] });
  });
  router.delete("/views/:viewId", async (req, res) => {
    const result = await db.query("DELETE FROM saved_views WHERE id = $1", [req.params.viewId]);
    if (!result.rowCount) { notFound(res, "View"); return; }
    res.status(204).end();
  });
  return router;
}

import express, { type ErrorRequestHandler } from "express";
import { activityStore, type Database } from "./activities.js";
import { workspaceRouter } from "./workspace.js";
import { z } from "zod";
import { createActivitySchema, updateActivitySchema } from "./activity-schema.js";

export function createApp(db: Database) {
  const app = express();
  const activities = activityStore(db);
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.post("/api/activities", async (req, res) => {
    const parsed = createActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: {
        code: "VALIDATION_ERROR", message: "Invalid activity data",
        issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
      } });
      return;
    }
    res.status(201).json({ data: await activities.create(parsed.data) });
  });
  app.get("/api/activities", async (_req, res) => {
    res.json({ data: await activities.list() });
  });
  app.param("id", (req, res, next, id) => {
    if (!z.uuid().safeParse(id).success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid activity ID" } });
      return;
    }
    next();
  });
  app.get("/api/activities/:id", async (req, res) => {
    const activity = await activities.get(req.params.id);
    if (!activity) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Activity not found" } }); return; }
    res.json({ data: activity });
  });
  app.patch("/api/activities/:id", async (req, res) => {
    const parsed = updateActivitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid activity data",
        issues: parsed.error.issues.map(({ path, message }) => ({ path, message })) } });
      return;
    }
    const activity = await activities.update(req.params.id, parsed.data);
    if (!activity) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Activity not found" } }); return; }
    res.json({ data: activity });
  });
  app.delete("/api/activities/:id", async (req, res) => {
    if (!await activities.remove(req.params.id)) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Activity not found" } }); return;
    }
    res.status(204).end();
  });
  app.get("/api/trash", async (_req, res) => {
    res.json({data: await activities.trash()});
  });
  app.post("/api/trash/:id/restore", async (req, res) => {
    const activity = await activities.restore(req.params.id);
    if (!activity) { res.status(404).json({ error: {code: "NOT_FOUND", message: "Trashed activity not found"} }); return; }
    res.json({data: activity});
  });
  app.use("/api", workspaceRouter(db));
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const type = typeof error === "object" && error !== null && "type" in error
      ? error.type : undefined;
    if (type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } });
      return;
    }
    if (type === "entity.too.large") {
      res.status(413).json({ error: { code: "BODY_TOO_LARGE", message: "Request body exceeds 100kb" } });
      return;
    }
    if (type === "encoding.unsupported" || type === "charset.unsupported") {
      res.status(415).json({ error: { code: "UNSUPPORTED_ENCODING", message: "Unsupported request encoding" } });
      return;
    }
    console.error(error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  };
  app.use(handleError);
  return app;
}

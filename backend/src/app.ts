import express, { type ErrorRequestHandler } from "express";
import type { Pool } from "pg";
import { activityStore } from "./activities.js";
import { createActivitySchema } from "./activity-schema.js";

export function createApp(db: Pick<Pool, "query">) {
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

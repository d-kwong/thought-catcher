import assert from "node:assert/strict";
import { createActivitySchema } from "./activity-schema.js";

const task = createActivitySchema.parse({
  kind: "task",
  title: "  Finish README  ",
  due_date: "2026-11-01",
});

assert(task.kind === "task");
assert.equal(task.title, "Finish README");
assert.equal(task.due_date, "2026-11-01");

assert.equal(
  createActivitySchema.safeParse({
    kind: "note",
    title: "Project ideas",
  }).success,
  true
);

const invalidInputs = [
  { kind: "task", title: "   " },
  { kind: "task", title: "Invalid date", due_date: "2026-02-30" },
  { kind: "note", title: "A note", due_date: "2026-11-01" },
  { kind: "task", title: "Unexpected field", completed_at: "anything" },
];

for (const input of invalidInputs) {
  assert.equal(createActivitySchema.safeParse(input).success, false);
}

console.log("Validation checks passed");
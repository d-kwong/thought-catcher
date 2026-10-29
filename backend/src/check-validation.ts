import assert from "node:assert/strict";
import { createActivitySchema } from "./activity-schema.js";

const activity = createActivitySchema.parse({
  title: "  Finish README  ",
  due_date: "2026-11-01",
  completed: true,
  tags: [" note ", "note", "school"],
});
assert.equal(activity.title, "Finish README");
assert.equal(activity.due_date, "2026-11-01");
assert.deepEqual(activity.tags, ["note", "school"]);
assert(createActivitySchema.safeParse({ title: "Project ideas", tags: ["note"] }).success);

for (const input of [
  { title: "   " },
  { title: "Invalid date", due_date: "2026-02-30" },
  { title: "Empty tag", tags: [" "] },
  { title: "Invalid completion", completed: "yes" },
  { title: "Unexpected field", completed_at: "anything" },
  { title: "Old contract", kind: "note" },
]) {
  assert.equal(createActivitySchema.safeParse(input).success, false);
}
console.log("Validation checks passed");

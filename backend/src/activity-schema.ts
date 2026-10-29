import { z } from "zod";

export const activityTypes = ["note", "task", "event"] as const;
export type ActivityType = typeof activityTypes[number];
export const isActivityType = (tag: string): tag is ActivityType =>
  activityTypes.some(type => type === tag);
const tagsSchema = z.array(z.string().trim().min(1, "Tag cannot be empty"))
  .transform(tags => [...new Set(tags)])
  .refine(tags => tags.filter(isActivityType).length === 1,
    "Choose exactly one type tag: note, task, or event");

const activityFields = z.strictObject({
  title: z.string().trim().min(1, "Title is required"),
  body: z.string().nullable().optional(),
  due_date: z.iso.date().nullable().optional(),
  event_date: z.iso.date().nullable().optional(),
  status: z.enum(["todo", "in_progress", "completed"]).optional(),
  completed: z.boolean().optional(),
  tags: tagsSchema,
});

const consistentCompletion = (input: {status?: string; completed?: boolean}) =>
  input.status === undefined || input.completed === undefined ||
  (input.status === "completed") === input.completed;
export const createActivitySchema = activityFields.refine(consistentCompletion,
  "Status and completion must agree");
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = activityFields.partial().refine(consistentCompletion,
  "Status and completion must agree").refine(
  input => Object.keys(input).length > 0, "Provide at least one field"
);
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

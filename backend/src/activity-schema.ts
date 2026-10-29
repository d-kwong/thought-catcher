import { z } from "zod";

const sharedFields = {
  title: z.string().trim().min(1, "Title is required"),
  body: z.string().nullable().optional(),
};

export const createActivitySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...sharedFields,
    kind: z.literal("task"),
    due_date: z.iso.date().nullable().optional(),
  }),
  z.strictObject({
    ...sharedFields,
    kind: z.literal("note"),
  }),
]);

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
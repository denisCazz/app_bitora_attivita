import { z } from "zod";

export const valuesSchema = z.object({
  title: z.string().trim().max(160).optional(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
});

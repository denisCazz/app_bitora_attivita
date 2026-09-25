import type { ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "));
  }
  return result.data;
}

export async function must<T>(query: Promise<T | null>, label = "Elemento"): Promise<T> {
  const row = await query;
  if (!row) throw new HttpError(404, `${label} non trovato`);
  return row;
}

export function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function blankToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  console.error("[api]", error);
  return Response.json({ error: message }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("Request body must be a JSON object");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Invalid JSON body");
  }
}

export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new ApiError(`${field} is too long`);
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLength = 500): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new ApiError(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) throw new ApiError(`${field} is too long`);
  return trimmed;
}

export function requireId(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`${field} must be a valid id`);
  }
  return parsed;
}

export function requireDate(value: unknown, field: string): string {
  if (value == null || value === "") return new Date().toISOString().slice(0, 10);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(`${field} must be a YYYY-MM-DD date`);
  }
  return value;
}

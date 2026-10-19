import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Единый формат ошибок API. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/** Оборачивает обработчик роута: zod-ошибки → 422, ApiError → свой статус, прочее → 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      return jsonError(e.message, e.status, e.details);
    }
    if (e instanceof ZodError) {
      return jsonError("Ошибка валидации", 422, e.issues);
    }
    console.error("[api]", e);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

/** Парсит JSON-тело через zod; некорректный JSON → ApiError 400. */
export async function parseBody<T>(
  req: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Ожидается JSON-тело запроса");
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    throw new ApiError(422, "Ошибка валидации", res.error.issues);
  }
  return res.data;
}

import { z, type ZodType } from "zod";

// ============================================================
// Единственный LLM-адаптер. Реализация — OpenAI-совместимый API.
// Env (обязательны): LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.
// При ошибке валидации JSON — repair-запрос (max 2 попытки суммарно).
// ============================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions<T> {
  /** zod-схема строгого JSON-выхода (→ JSON Schema для API). */
  schema?: ZodType<T>;
  temperature?: number;
}

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMError";
  }
}

/** Статус конфигурации для health-check. */
export function llmStatus(): { configured: boolean; error?: string } {
  const missing = [
    !process.env.LLM_BASE_URL && "LLM_BASE_URL",
    !process.env.LLM_API_KEY && "LLM_API_KEY",
    !process.env.LLM_MODEL && "LLM_MODEL",
  ].filter(Boolean) as string[];
  if (missing.length > 0) {
    return {
      configured: false,
      error: `Не заданы переменные: ${missing.join(", ")} (файл .env, затем перезапустить сервер)`,
    };
  }
  return { configured: true };
}

function assertEnv(): { baseUrl: string; apiKey: string; model: string } {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new LLMError(
      "LLM не настроен: задайте переменные окружения LLM_BASE_URL, LLM_API_KEY, LLM_MODEL (см. Readme)",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

function extractJson(raw: string): unknown {
  let text = raw.trim();
  // Убираем markdown-ограждения ```json ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    // Иногда модель возвращает JSON с пояснениями до/после — берём самый внешний {...}
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new LLMError("LLM вернул не-JSON ответ");
  }
}

/**
 * Режим строгого JSON для провайдера. Некоторые API (например, DeepSeek)
 * не поддерживают response_format=json_schema — при 400 автоматически
 * деградируем: schema → object (+схема текстом в промте) → без формата.
 */
let responseFormatMode: "schema" | "object" | "none" = "schema";

function withSchemaHint(messages: ChatMessage[], schemaJson: Record<string, unknown> | undefined): ChatMessage[] {
  if (!schemaJson) return messages;
  const hint = `\n\nФормат ответа: СТРОГО валидный JSON без какого-либо текста вокруг. Обязательная структура: ${JSON.stringify(schemaJson)}`;
  return messages.map((m, i) => (i === 0 ? { ...m, content: `${m.content}${hint}` } : m));
}

async function callOpenAiCompatible(
  messages: ChatMessage[],
  schemaJson: Record<string, unknown> | undefined,
  temperature: number,
): Promise<string> {
  const { baseUrl, apiKey, model } = assertEnv();

  // Thinking-модели (qwen3 и т.п.): отключаем размышления — для строгого
  // JSON они не нужны и приводят к пустому content / минутным задержкам
  const baseMessages: ChatMessage[] = /qwen3/i.test(model)
    ? messages.map((m, i) => (i === 0 ? { ...m, content: `${m.content}\n\n/no_think` } : m))
    : messages;

  for (;;) {
    let finalMessages = baseMessages;
    const body: Record<string, unknown> = {
      model,
      messages: finalMessages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
    };
    if (schemaJson && responseFormatMode === "schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "result", strict: false, schema: schemaJson },
      };
    } else if (schemaJson && responseFormatMode === "object") {
      body.response_format = { type: "json_object" };
      finalMessages = withSchemaHint(baseMessages, schemaJson);
      body.messages = finalMessages.map((m) => ({ role: m.role, content: m.content }));
    } else {
      finalMessages = withSchemaHint(baseMessages, schemaJson);
      body.messages = finalMessages.map((m) => ({ role: m.role, content: m.content }));
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000), // локальные модели (Ollama) с размышлениями бывают медленными
    });

    if (res.status === 400) {
      const errText = await res.text().catch(() => "");
      if (errText.includes("response_format") && responseFormatMode !== "none") {
        // Провайдер не поддерживает текущий режим — деградируем и ретраим сразу
        responseFormatMode = responseFormatMode === "schema" ? "object" : "none";
        continue;
      }
      throw new LLMError(`LLM API 400: ${errText.slice(0, 300)}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMError(`LLM API ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          // thinking-модели: ответ может уехать в reasoning-поля
          reasoning_content?: string | null;
          reasoning?: string | null;
        };
      }[];
    };
    const message = json.choices?.[0]?.message;
    const content = message?.content || message?.reasoning_content || message?.reasoning;
    if (!content) throw new LLMError("LLM API: пустой ответ");
    return content;
  }
}

/**
 * Один вызов LLM со строгим JSON-выходом и zod-валидацией.
 * Сетевая ошибка или провал валидации → repair-запрос, суммарно max 2 попытки.
 */
export async function chat<T>(messages: ChatMessage[], opts: ChatOptions<T> = {}): Promise<T> {
  const schemaJson = opts.schema ? (z.toJSONSchema(opts.schema) as Record<string, unknown>) : undefined;
  const conversation: ChatMessage[] = [...messages];

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callOpenAiCompatible(conversation, schemaJson, opts.temperature ?? 0.3);
    } catch (e) {
      lastError = e;
      // Одна повторная попытка при сетевой/API ошибке
      continue;
    }
    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch (e) {
      lastError = e;
      conversation.push({ role: "assistant", content: raw });
      conversation.push({
        role: "user",
        content: "Твой предыдущий ответ не является корректным JSON. Верни ТОЛЬКО валидный JSON по схеме, без пояснений.",
      });
      continue;
    }
    if (!opts.schema) return parsed as T;
    const validated = opts.schema.safeParse(parsed);
    if (validated.success) return validated.data;
    lastError = new LLMError(`JSON не прошёл валидацию: ${JSON.stringify(validated.error.issues.slice(0, 3))}`);
    conversation.push({ role: "assistant", content: raw });
    conversation.push({
      role: "user",
      content: `JSON не прошёл валидацию схемы. Ошибки: ${JSON.stringify(validated.error.issues.slice(0, 5))}. Верни исправленный ТОЛЬКО JSON.`,
    });
  }
  throw lastError instanceof Error ? lastError : new LLMError("LLM: неизвестная ошибка");
}

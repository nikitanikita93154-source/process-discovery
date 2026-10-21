import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";
import { chat, llmStatus } from "@/lib/llm";
import { z } from "zod";

/**
 * GET /api/health/llm — быстрая проверка LLM-подключения:
 * один мини-вызов со схемой; возвращает статус, модель и задержку.
 * Используйте после смены LLM_* в .env, перед запуском интервью.
 */
export async function GET() {
  return handle(async () => {
    await requireApiOwner();

    const configured = llmStatus();
    if (!configured.configured) {
      return NextResponse.json(
        { ok: false, configured: false, error: configured.error },
        { status: 200 },
      );
    }

    const started = Date.now();
    try {
      const result = await chat(
        [
          { role: "system", content: "Отвечай строго JSON по схеме." },
          { role: "user", content: "Верни ping равным строке \"pong\"." },
        ],
        { schema: z.object({ ping: z.string() }), temperature: 0 },
      );
      return NextResponse.json({
        ok: result.ping === "pong" || true,
        configured: true,
        model: process.env.LLM_MODEL,
        latencyMs: Date.now() - started,
        echo: result.ping,
      });
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          model: process.env.LLM_MODEL,
          latencyMs: Date.now() - started,
          error: e instanceof Error ? e.message : "неизвестная ошибка",
        },
        { status: 200 },
      );
    }
  });
}

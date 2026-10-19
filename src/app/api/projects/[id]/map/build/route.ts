import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ApiError, parseBody } from "@/lib/api";
import { requireApiOwner, requireProject } from "@/lib/guards";
import { chat } from "@/lib/llm";
import { llmMapSchema, normalizeLlmMap, processMapJsonSchema, type ProcessMapJson } from "@/lib/schemas/map";
import type { ParsedSource } from "@/lib/schemas/source";
import { diffMaps } from "@/lib/map/diff";

export const maxDuration = 180;

const bodySchema = z.object({}).optional();

/**
 * POST /api/projects/[id]/map/build — собрать карту из всех parsed-источников.
 * Если текущая версия — человеческая, новая карта НЕ сохраняется автоматически:
 * возвращается diff и preview для подтверждения (сохранение через map/save).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = await params;
    const project = await requireProject(id, owner.orgId);
    if (req.headers.get("content-length") !== "0") {
      await parseBody(req, bodySchema).catch(() => undefined);
    }

    const sources = await db.source.findMany({
      where: { projectId: project.id, status: "parsed" },
    });
    if (sources.length === 0) {
      throw new ApiError(422, "Нет обработанных источников — сначала соберите интервью или загрузите документ");
    }

    // --- Компактный контекст источников для LLM ---
    const sourcesContext = sources
      .map((s) => {
        const p = (s.parsedJson as ParsedSource | null) ?? null;
        return (
          `ИСТОЧНИК ${s.id} (${s.type === "interview" ? "интервью" : "документ"}: «${s.name}»)\n` +
          `Шаги: ${(p?.candidateSteps ?? []).map((st) => `${st.name}${st.actor ? ` [${st.actor}]` : ""}${st.system ? ` {${st.system}}` : ""}${st.frequency ? ` @${st.frequency}` : ""}`).join("; ") || "—"}\n` +
          `Участники: ${(p?.actors ?? []).join(", ") || "—"}\n` +
          `Правила: ${(p?.rules ?? []).map((r) => `${r.text} (${r.source ?? "?"})`).join("; ") || "—"}\n` +
          `Исключения: ${(p?.exceptions ?? []).join("; ") || "—"}\n` +
          `Цитаты: ${(p?.citations ?? []).map((c) => c.ref).join("; ") || "—"}`
        );
      })
      .join("\n\n");

    const llmMap = await chat(
      [
        {
          role: "system",
          content: `Ты — архитектор бизнес-процессов. Собери из источников единую карту процесса: сгруппируй шаги в последовательные стадии (этапы), у каждого шага укажи актора, систему, триггер. Правила и исключения преврати в decisions (условия перехода) и risks (severity/likelihood: «низкая»/«средняя»/«высокая», mitigation — как снизить, source — источник). КАЖДОМУ шагу проставь citations: [{sourceId, ref}] из источников (ref — страница/раздел/тема). Не выдумывай шаги, которых нет в источниках. Отвечай СТРОГО JSON по схеме.`,
        },
        { role: "user", content: `Проект: «${project.title}»\n\n${sourcesContext}` },
      ],
      { schema: llmMapSchema, temperature: 0.2 },
    );

    const validSourceIds = new Set(sources.map((s) => s.id));
    const newJson = normalizeLlmMap(llmMap, validSourceIds);
    processMapJsonSchema.parse(newJson);

    const latest = await db.processMap.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
    });

    // Человеческие правки не затираем: при rebuild возвращаем diff на подтверждение
    if (latest && latest.author === "human") {
      const oldJson = latest.json as ProcessMapJson;
      return NextResponse.json({
        requiresApproval: true,
        diff: diffMaps(oldJson, newJson),
        preview: newJson,
        currentVersion: latest.version,
      });
    }

    const map = await db.processMap.create({
      data: {
        projectId: project.id,
        version: (latest?.version ?? 0) + 1,
        json: newJson,
        author: "ai",
      },
    });
    if (project.status === "capturing") {
      await db.project.update({ where: { id: project.id }, data: { status: "mapping" } });
    }

    return NextResponse.json({
      requiresApproval: false,
      mapId: map.id,
      version: map.version,
      json: newJson,
      diff: latest ? diffMaps(latest.json as ProcessMapJson, newJson) : [],
    });
  });
}

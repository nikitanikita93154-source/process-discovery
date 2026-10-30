import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ApiError } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";
import { chat } from "@/lib/llm";
import { processMapJsonSchema, type ProcessMapJson } from "@/lib/schemas/map";
import { parsedSourceSchema, type ParsedSource } from "@/lib/schemas/source";
import { analysisScoresSchema, hoursEstimateSchema, swotSchema } from "@/lib/schemas/analysis";
import { buildInterviewIndex, scoreMap } from "@/lib/scoring";

export const maxDuration = 180;

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = z.object({ id: z.string() }).parse(await params);

    const map = await db.processMap.findFirst({
      where: { id, project: { orgId: owner.orgId } },
      orderBy: { version: "desc" },
    });
    if (!map) throw new ApiError(404, "Карта не найдена");

    const mapJson = processMapJsonSchema.safeParse(map.json);
    if (!mapJson.success) throw new ApiError(422, "Карта повреждена — пересоберите её");
    const json: ProcessMapJson = mapJson.data;

    const org = await db.organization.findUnique({ where: { id: owner.orgId } });
    const hourlyRate = org?.hourlyRate ?? 50;

    // Факты: интервью-источники проекта
    const sourceRows = await db.source.findMany({
      where: { projectId: map.projectId, type: "interview", status: "parsed" },
    });
    const parsedSources = sourceRows
      .map((s) => (s.parsedJson ? parsedSourceSchema.safeParse(s.parsedJson) : null))
      .filter((r): r is { success: true; data: ParsedSource } => r?.success === true)
      .map((r) => r.data);

    const interviewIndex = buildInterviewIndex(parsedSources);

    // --- Детерминированный скоринг ---
    const llmEstimates = new Map<string, number>();
    const llmNotes: string[] = [];

    // предварительный расчёт, чтобы найти шаги без часов из фактов
    const preScored = scoreMap({ map: json, interviewIndex, hourlyRate, llmEstimates: new Map() });
    const needsEstimate = preScored.steps.filter((s) => s.hoursEstimate);
    if (needsEstimate.length > 0) {
      try {
        const est = await chat(
          [
            {
              role: "system",
              content: `Ты — аналитик операций. Для каждого шага процесса оцени реалистичные затраты часов в год (hoursPerYear) на основе названия шага, актора и системы. Отвечай СТРОГО JSON по схеме.`,
            },
            {
              role: "user",
              content: needsEstimate
                .map((s) => `- ${s.stepName} (актор: ${s.actor || "?"}, система: ${interviewIndex.entries.get(norm(s.stepName))?.system || "?"})`)
                .join("\n"),
            },
          ],
          { schema: hoursEstimateSchema, temperature: 0.2 },
        );
        for (const e of est.estimates) {
          if (e.hoursPerYear > 0) llmEstimates.set(norm(e.stepName), e.hoursPerYear);
        }
        llmNotes.push(`Оценки часов LLM для ${needsEstimate.length} шагов помечены как estimate`);
      } catch {
        llmNotes.push("LLM-оценки часов недоступны — использована консервативная заглушка 20 ч/год (estimate)");
      }
    }

    const { steps, totals, stp } = scoreMap({ map: json, interviewIndex, hourlyRate, llmEstimates });

    // --- SWOT (LLM) ---
    let swot = { strengths: [] as string[], weaknesses: [] as string[], opportunities: [] as string[], threats: [] as string[] };
    try {
      swot = await chat(
        [
          {
            role: "system",
            content: `Ты — консультант по автоматизации. По карте процесса и скорингу составь SWOT: сильные и слабые стороны текущего процесса, возможности автоматизации (используя подсказки технологий), угрозы/риски внедрения. По 3–5 пунктов на квадрант, конкретно. Отвечай СТРОГО JSON по схеме.`,
          },
          {
            role: "user",
            content: `Процесс: ${json.stages.map((s) => s.name).join(" → ")}\nШаги и скоринг:\n${steps
              .map((s) => `- ${s.stepName}: score ${s.automationScore}, ${s.hoursPerYear} ч/год, тех: ${s.suggestTech}`)
              .join("\n")}`,
          },
        ],
        { schema: swotSchema, temperature: 0.3 },
      );
    } catch {
      llmNotes.push("SWOT недоступен: LLM не настроен или недоступен");
    }

    const scores = analysisScoresSchema.parse({
      steps,
      totals,
      stp,
      generatedAt: new Date().toISOString(),
      llmNotes,
    });

    const report = await db.analysisReport.create({
      data: { mapId: map.id, scores, swot },
    });

    await db.project.update({
      where: { id: map.projectId },
      data: { status: "analyzed" },
    });

    return NextResponse.json({ reportId: report.id, scores, swot });
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = z.object({ id: z.string() }).parse(await params);

    const report = await db.analysisReport.findFirst({
      where: { mapId: id, map: { project: { orgId: owner.orgId } } },
      orderBy: { createdAt: "desc" },
    });
    if (!report) return NextResponse.json({ report: null });
    return NextResponse.json({ report });
  });
}

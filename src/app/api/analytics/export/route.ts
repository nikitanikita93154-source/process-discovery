import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import type { AnalysisScores } from "@/lib/schemas/analysis";
import type { InterviewSummary } from "@/lib/schemas/interview";

/**
 * GET /api/analytics/export?type=steps|people
 * steps — ранжирование шагов по automationScore (все проекты организации)
 * people — отчёт по людям из завершённых интервью
 */
export async function GET(req: Request) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const type = new URL(req.url).searchParams.get("type") ?? "steps";

    if (type === "people") {
      const rows = await db.interviewSession.findMany({
        where: { status: "completed", user: { orgId: owner.orgId } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { startedAt: "asc" },
      });
      const csv = toCsv(
        ["Сотрудник", "Email", "Должность", "Отдел", "Процессов", "Процессы", "Главные боли"],
        rows.map((r) => {
          const s = r.summary as InterviewSummary | null;
          return [
            r.user.name,
            r.user.email,
            s?.employee?.position ?? "",
            s?.employee?.department ?? "",
            s?.processes.length ?? 0,
            (s?.processes ?? []).map((p) => p.name).join("; "),
            (s?.processes ?? []).map((p) => p.pain).filter(Boolean).join("; "),
          ];
        }),
      );
      return csvResponse(csv, "people-interviews.csv");
    }

    // steps
    const reports = await db.analysisReport.findMany({
      where: { map: { project: { orgId: owner.orgId } } },
      orderBy: { createdAt: "desc" },
      include: { map: { include: { project: { select: { title: true } } } } },
    });

    // только последние отчёты по каждой карте
    const seenMaps = new Set<string>();
    const rows: (string | number | boolean)[][] = [];
    for (const rep of reports) {
      if (seenMaps.has(rep.mapId)) continue;
      seenMaps.add(rep.mapId);
      const scores = rep.scores as AnalysisScores;
      for (const s of scores.steps) {
        rows.push([
          rep.map.project.title,
          s.stage,
          s.stepName,
          s.actor,
          s.hoursPerYear,
          s.hoursEstimate ? "да" : "нет",
          s.costPerYear,
          s.automationScore,
          s.suggestTech,
          s.priority,
        ]);
      }
    }
    rows.sort((a, b) => Number(b[7]) - Number(a[7]));

    const csv = toCsv(
      ["Процесс", "Стадия", "Шаг", "Актор", "Часов/год", "Оценка (estimate)", "Стоимость/год", "AutomationScore", "Технология", "Приоритет"],
      rows,
    );
    return csvResponse(csv, "steps-ranking.csv");
  });
}

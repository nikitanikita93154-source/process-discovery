import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import type { AnalysisScores } from "@/lib/schemas/analysis";
import type { Test1Answers } from "@/lib/schemas/test1";

/**
 * GET /api/analytics/export?type=steps|people
 * steps — ранжирование шагов по automationScore (все проекты организации)
 * people — отчёт по людям из Блока 6 Теста 1 (отношение к AI)
 */
export async function GET(req: Request) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const type = new URL(req.url).searchParams.get("type") ?? "steps";

    if (type === "people") {
      const rows = await db.test1Session.findMany({
        where: { status: "completed", user: { orgId: owner.orgId } },
        include: { user: { select: { name: true, email: true } } },
      });
      const csv = toCsv(
        ["Сотрудник", "Email", "Отдел", "Должность", "Отношение к AI (1-5)", "Страхи", "Задача для AI «джинна»"],
        rows.map((r) => {
          const a = r.answers as Test1Answers | null;
          return [
            r.user.name,
            r.user.email,
            a?.passport?.department ?? "",
            a?.passport?.position ?? "",
            a?.aiAttitude?.attitudeScore ?? "",
            a?.aiAttitude?.fears?.join(", ") ?? "",
            a?.aiAttitude?.genieTask ?? "",
          ];
        }),
      );
      return csvResponse(csv, "people-ai-report.csv");
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

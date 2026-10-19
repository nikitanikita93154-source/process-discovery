import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ru } from "@/lib/content/ru";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatHours, formatMoney } from "@/lib/utils";
import type { AnalysisScores } from "@/lib/schemas/analysis";
import type { Test1Answers } from "@/lib/schemas/test1";
import { ExportButtons } from "@/components/export-buttons";

export default async function AnalyticsPage() {
  const owner = await requirePageOwner();

  const [reports, t1Rows] = await Promise.all([
    db.analysisReport.findMany({
      where: { map: { project: { orgId: owner.orgId } } },
      orderBy: { createdAt: "desc" },
      include: { map: { include: { project: { select: { title: true } } } } },
    }),
    db.test1Session.findMany({
      where: { status: "completed", user: { orgId: owner.orgId } },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  // последние отчёты по картам
  const seen = new Set<string>();
  const latestReports = reports.filter((r) => {
    if (seen.has(r.mapId)) return false;
    seen.add(r.mapId);
    return true;
  });

  const allSteps = latestReports.flatMap((rep) => {
    const scores = rep.scores as AnalysisScores;
    return scores.steps.map((s) => ({ ...s, project: rep.map.project.title }));
  });
  allSteps.sort((a, b) => b.automationScore - a.automationScore);

  // Тепловая карта по отделам (из Т1)
  const byDept = new Map<string, { employees: number; irritationSum: number; irritationCount: number; tasks: number }>();
  const people = t1Rows.map((r) => {
    const a = r.answers as Test1Answers | null;
    const dept = a?.passport?.department ?? "—";
    const entry = byDept.get(dept) ?? { employees: 0, irritationSum: 0, irritationCount: 0, tasks: 0 };
    entry.employees++;
    entry.tasks += a?.tasks?.length ?? 0;
    for (const t of a?.tasks ?? []) {
      entry.irritationSum += t.irritation;
      entry.irritationCount++;
    }
    byDept.set(dept, entry);
    return {
      name: r.user.name,
      department: dept,
      position: a?.passport?.position ?? "—",
      attitude: a?.aiAttitude?.attitudeScore ?? null,
      fears: a?.aiAttitude?.fears ?? [],
      genieTask: a?.aiAttitude?.genieTask ?? "",
    };
  });

  const heatColor = (value: number, max: number): string => {
    const ratio = max === 0 ? 0 : value / max;
    if (ratio >= 0.75) return "bg-red-100 text-red-800";
    if (ratio >= 0.5) return "bg-amber-100 text-amber-800";
    if (ratio >= 0.25) return "bg-yellow-50 text-yellow-800";
    return "bg-emerald-50 text-emerald-800";
  };

  const maxIrritation = Math.max(
    ...[...byDept.values()].map((d) => (d.irritationCount > 0 ? d.irritationSum / d.irritationCount : 0)),
    1,
  );
  const maxTasks = Math.max(...[...byDept.values()].map((d) => d.tasks), 1);

  const hasData = allSteps.length > 0 || people.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{ru.analytics.title}</h1>
        </div>
        <ExportButtons />
      </div>

      {!hasData && <p className="py-10 text-center text-zinc-400">{ru.analytics.empty}</p>}

      {allSteps.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>{ru.analytics.ranking}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Процесс</TH>
                  <TH>{ru.analysis.stepColumn}</TH>
                  <TH className="text-right">{ru.analysis.hoursColumn}</TH>
                  <TH className="text-right">{ru.analysis.costColumn}</TH>
                  <TH className="text-right">{ru.analysis.scoreColumn}</TH>
                  <TH>{ru.analysis.techColumn}</TH>
                </TR>
              </THead>
              <TBody>
                {allSteps.slice(0, 20).map((s) => (
                  <TR key={`${s.project}-${s.stepId}`}>
                    <TD className="text-zinc-500">{s.project}</TD>
                    <TD className="font-medium">{s.stepName}</TD>
                    <TD className="text-right">
                      {formatHours(s.hoursPerYear)}
                      {s.hoursEstimate && <Badge variant="warning" className="ml-1">?</Badge>}
                    </TD>
                    <TD className="text-right">{formatMoney(s.costPerYear)} ₽</TD>
                    <TD className="text-right font-bold text-indigo-600">{s.automationScore}</TD>
                    <TD className="text-xs text-zinc-500">{s.suggestTech}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {byDept.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{ru.analytics.heatmap}</CardTitle>
            <CardDescription>{ru.analytics.heatmapHint}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...byDept.entries()].map(([dept, d]) => {
              const avgIrr = d.irritationCount > 0 ? d.irritationSum / d.irritationCount : 0;
              return (
                <div key={dept} className="rounded-lg border border-zinc-200 p-3">
                  <div className="font-medium">{dept}</div>
                  <div className="mt-2 flex gap-2">
                    <span className={`rounded px-2 py-1 text-xs ${heatColor(avgIrr, maxIrritation)}`}>
                      ср. раздражение {avgIrr.toFixed(1)}
                    </span>
                    <span className={`rounded px-2 py-1 text-xs ${heatColor(d.tasks, maxTasks)}`}>
                      задач {d.tasks}
                    </span>
                    <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                      сотр. {d.employees}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {people.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>{ru.analytics.peopleReport}</CardTitle>
            <CardDescription>
              Из Блока 6 Теста 1 (в скоринг не входит) — карта для управления изменениями
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{ru.common.employee}</TH>
                  <TH>{ru.common.department}</TH>
                  <TH>{ru.analytics.attitudeColumn}</TH>
                  <TH>{ru.analytics.fearsColumn}</TH>
                  <TH>{ru.analytics.genieColumn}</TH>
                </TR>
              </THead>
              <TBody>
                {people.map((p) => (
                  <TR key={p.name}>
                    <TD className="font-medium">{p.name}</TD>
                    <TD>{p.department}</TD>
                    <TD>
                      {p.attitude !== null ? (
                        <Badge variant={p.attitude >= 4 ? "success" : p.attitude >= 3 ? "default" : "destructive"}>
                          {p.attitude}/5
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-xs text-zinc-600">{p.fears.join(", ") || "—"}</TD>
                    <TD className="max-w-[240px] text-xs text-zinc-600">{p.genieTask || "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ru } from "@/lib/content/ru";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatHours, formatMoney } from "@/lib/utils";
import type { AnalysisScores } from "@/lib/schemas/analysis";
import type { InterviewSummary } from "@/lib/schemas/interview";
import { ExportButtons } from "@/components/export-buttons";

export default async function AnalyticsPage() {
  const owner = await requirePageOwner();

  const [reports, interviews] = await Promise.all([
    db.analysisReport.findMany({
      where: { map: { project: { orgId: owner.orgId } } },
      orderBy: { createdAt: "desc" },
      include: { map: { include: { project: { select: { title: true } } } } },
    }),
    db.interviewSession.findMany({
      where: { status: "completed", user: { orgId: owner.orgId } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { startedAt: "asc" },
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

  // Люди и отделы — из резюме завершённых интервью
  const people = interviews.map((r) => {
    const summary = r.summary as InterviewSummary | null;
    return {
      name: r.user.name,
      email: r.user.email,
      department: summary?.employee?.department || "—",
      position: summary?.employee?.position || "—",
      processes: summary?.processes ?? [],
    };
  });

  const byDept = new Map<string, { employees: number; processes: number }>();
  for (const p of people) {
    const entry = byDept.get(p.department) ?? { employees: 0, processes: 0 };
    entry.employees++;
    entry.processes += p.processes.length;
    byDept.set(p.department, entry);
  }

  const heatColor = (value: number, max: number): string => {
    const ratio = max === 0 ? 0 : value / max;
    if (ratio >= 0.75) return "bg-red-100 text-red-800";
    if (ratio >= 0.5) return "bg-amber-100 text-amber-800";
    if (ratio >= 0.25) return "bg-yellow-50 text-yellow-800";
    return "bg-emerald-50 text-emerald-800";
  };
  const maxProcesses = Math.max(...[...byDept.values()].map((d) => d.processes), 1);

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
            {[...byDept.entries()].map(([dept, d]) => (
              <div key={dept} className="rounded-lg border border-zinc-200 p-3">
                <div className="font-medium">{dept}</div>
                <div className="mt-2 flex gap-2">
                  <span className={`rounded px-2 py-1 text-xs ${heatColor(d.processes, maxProcesses)}`}>
                    {ru.analytics.processesColumn.toLowerCase()} {d.processes}
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                    сотр. {d.employees}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {people.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>{ru.analytics.peopleReport}</CardTitle>
            <CardDescription>Из завершённых интервью</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{ru.common.employee}</TH>
                  <TH>{ru.analytics.positionColumn}</TH>
                  <TH>{ru.analytics.departmentColumn}</TH>
                  <TH className="text-right">{ru.analytics.processesColumn}</TH>
                  <TH>{ru.analytics.painsColumn}</TH>
                </TR>
              </THead>
              <TBody>
                {people.map((p) => (
                  <TR key={p.email}>
                    <TD className="font-medium">{p.name}</TD>
                    <TD>{p.position}</TD>
                    <TD>{p.department}</TD>
                    <TD className="text-right">{p.processes.length}</TD>
                    <TD className="max-w-[320px] text-xs text-zinc-600">
                      {p.processes.map((x) => x.pain).filter(Boolean).join("; ") || "—"}
                    </TD>
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

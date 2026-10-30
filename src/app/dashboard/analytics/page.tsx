import { Eyebrow, PageTitle } from "@/components/ui/brand";
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
    if (ratio >= 0.75) return "bg-accent text-white";
    if (ratio >= 0.5) return "bg-lime text-ink";
    if (ratio >= 0.25) return "bg-lime-soft text-ink";
    return "bg-cream text-muted";
  };
  const maxProcesses = Math.max(...[...byDept.values()].map((d) => d.processes), 1);

  const hasData = allSteps.length > 0 || people.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="space-y-2"><Eyebrow>SYNAPT · РЕЗУЛЬТАТЫ</Eyebrow><PageTitle>{ru.analytics.title}</PageTitle><p className="max-w-2xl text-sm leading-relaxed text-muted">От знаний о процессах — к приоритетам автоматизации.</p></div>
        </div>
        <ExportButtons />
      </div>

      {!hasData && <p className="py-10 text-center text-muted">{ru.analytics.empty}</p>}

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
                    <TD className="text-muted">{s.project}</TD>
                    <TD className="font-medium">{s.stepName}</TD>
                    <TD className="text-right">
                      {formatHours(s.hoursPerYear)}
                      {s.hoursEstimate && <Badge variant="warning" className="ml-1">?</Badge>}
                    </TD>
                    <TD className="text-right">{formatMoney(s.costPerYear)} ₽</TD>
                    <TD className="text-right font-bold text-ink">{s.automationScore}</TD>
                    <TD className="text-xs text-muted">{s.suggestTech}</TD>
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
              <div key={dept} className="rounded-[14px] border border-line p-3">
                <div className="font-medium">{dept}</div>
                <div className="mt-2 flex gap-2">
                  <span className={`rounded-full px-3 py-1 font-mono text-[10px] ${heatColor(d.processes, maxProcesses)}`}>
                    {ru.analytics.processesColumn.toLowerCase()} {d.processes}
                  </span>
                  <span className="rounded-full bg-paper px-3 py-1 font-mono text-[10px] text-muted">
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
                    <TD className="max-w-[320px] text-xs text-muted">
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

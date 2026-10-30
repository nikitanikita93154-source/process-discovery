"use client";

import { Trophy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import type { AnalysisScores, Swot } from "@/lib/schemas/analysis";
import { FACTOR_LABELS } from "@/lib/scoring/weights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatHours, formatMoney } from "@/lib/utils";

function scoreColor(score: number): string {
  if (score >= 70) return "bg-lime";
  if (score >= 40) return "bg-lime/70";
  return "bg-lime/40";
}

const SWOT_COLORS = {
  s: "text-ok",
  w: "text-warn",
  o: "text-ink",
  t: "text-danger",
} as const;

export function AnalysisClient({
  mapId,
  report,
}: {
  mapId: string | null;
  report: { scores: AnalysisScores; swot: Swot; createdAt: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!mapId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/maps/${mapId}/analyze`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? ru.errors.generic);
      } else {
        router.refresh();
      }
    } catch {
      setError(ru.errors.network);
    } finally {
      setBusy(false);
    }
  };

  if (!mapId) {
    return <p className="py-10 text-center text-muted">{ru.analysis.empty}</p>;
  }

  const scores = report?.scores;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? ru.analysis.running : ru.analysis.run}
        </Button>
        {report && (
          <span className="text-xs text-muted">
            {ru.analysis.generatedAt}: {new Date(report.createdAt).toLocaleString("ru-RU")}
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>

      {!report && !busy && <p className="py-10 text-center text-muted">{ru.analysis.empty}</p>}

      {scores && (
        <>
          {/* Сводка */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.analysis.hoursTotal}</div>
                <div className="mt-3 font-head text-2xl font-medium tracking-tight">{formatHours(scores.totals.hoursPerYear)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.analysis.costTotal}</div>
                <div className="mt-3 font-head text-2xl font-medium tracking-tight">{formatMoney(scores.totals.costPerYear)} ₽</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.analysis.stpTitle}: {ru.analysis.stpCurrent}</div>
                <div className="mt-3 font-head text-base font-medium leading-relaxed">{formatHours(scores.stp.currentHours)} ч → {formatMoney(scores.stp.currentCost)} ₽</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.analysis.stpForecast}</div>
                <div className="mt-3 font-head text-base font-medium leading-relaxed text-ok">
                  {formatHours(scores.stp.forecastHours)} ч → {formatMoney(scores.stp.forecastCost)} ₽
                </div>
              </CardContent>
            </Card>
          </div>

          {scores.llmNotes.length > 0 && (
            <div className="rounded-[14px] bg-warn-soft px-4 py-2 text-sm text-warn">
              {scores.llmNotes.map((n, i) => (
                <div key={i} className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{n}</div>
              ))}
            </div>
          )}

          {/* Таблица шагов */}
          <Card>
            <CardHeader className="pb-0">
              <CardTitle>{ru.analysis.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>{ru.analysis.stepColumn}</TH>
                    <TH className="text-right">{ru.analysis.hoursColumn}</TH>
                    <TH className="text-right">{ru.analysis.costColumn}</TH>
                    <TH>{ru.analysis.scoreColumn}</TH>
                    <TH>{ru.analysis.techColumn}</TH>
                    <TH className="text-right">{ru.analysis.priorityColumn}</TH>
                  </TR>
                </THead>
                <TBody>
                  {scores.steps.map((s) => (
                    <TR key={s.stepId}>
                      <TD>
                        <div className="font-medium">{s.stepName}</div>
                        <div className="text-xs text-muted">
                          {s.stage} · {s.actor || "—"}
                        </div>
                      </TD>
                      <TD className="text-right">
                        {formatHours(s.hoursPerYear)}
                        {s.hoursEstimate && (
                          <Badge variant="warning" className="ml-1">
                            {ru.analysis.estimateBadge}
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-right">{formatMoney(s.costPerYear)} ₽</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-line">
                            <div className={`h-full ${scoreColor(s.automationScore)}`} style={{ width: `${s.automationScore}%` }} />
                          </div>
                          <span className="font-medium">{s.automationScore}</span>
                        </div>
                      </TD>
                      <TD className="max-w-[220px] text-xs text-muted">{s.suggestTech}</TD>
                      <TD className="text-right font-semibold">{s.priority}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {/* Топ-5 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-accent" />{ru.analysis.topCandidates}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {scores.steps.slice(0, 5).map((s, i) => (
                <div key={s.stepId} className="flex items-center justify-between rounded-[14px] border border-line p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-sm font-medium text-ink">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-medium">{s.stepName}</div>
                      <div className="text-xs text-muted">{s.suggestTech}</div>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-bold text-ink">{s.automationScore}</div>
                    <div className="text-xs text-muted">{formatHours(s.hoursPerYear)} ч/год</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* SWOT */}
          <Card className="border-line-warm bg-paper">
            <CardHeader className="pb-2">
              <CardTitle>{ru.analysis.swotTitle}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  [ru.analysis.swotS, report?.swot.strengths, SWOT_COLORS.s],
                  [ru.analysis.swotW, report?.swot.weaknesses, SWOT_COLORS.w],
                  [ru.analysis.swotO, report?.swot.opportunities, SWOT_COLORS.o],
                  [ru.analysis.swotT, report?.swot.threats, SWOT_COLORS.t],
                ] as const
              ).map(([title, items, color]) => (
                <div key={title} className="rounded-[14px] border border-line-warm bg-cream p-5">
                  <div className={`font-mono text-xs font-medium uppercase tracking-wider ${color}`}>{title}</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">
                    {(items ?? []).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                    {(items ?? []).length === 0 && <li className="text-muted">—</li>}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Разбор факторов топ-шага */}
          {scores.steps[0] && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>
                  {ru.analytics.ranking}: «{scores.steps[0].stepName}»
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(scores.steps[0].breakdown).map(([factor, value]) => (
                  <div key={factor} className="flex flex-wrap items-center gap-3">
                    <span className="w-40 text-sm text-muted">{FACTOR_LABELS[factor as keyof typeof FACTOR_LABELS] ?? factor}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full bg-lime" style={{ width: `${Math.min(100, value)}%` }} />
                    </div>
                    <span className="w-8 text-right text-sm">{Math.round(value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { statusBadgeVariant, statusLabel } from "@/lib/status";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface DashboardRow {
  id: string;
  name: string;
  department: string;
  status: string;
  date: string;
}

export function DashboardTable({ rows }: { rows: DashboardRow[] }) {
  const router = useRouter();
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const departments = Array.from(new Set(rows.map((r) => r.department).filter((d) => d && d !== "—")));
  const filtered = dept ? rows.filter((r) => r.department === dept) : rows;

  const removeEmployee = async (id: string, name: string) => {
    if (!confirm(`Удалить сотрудника ${name}? Его данные будут стёрты.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Не удалось удалить сотрудника. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-5">
        <CardTitle>Сотрудники</CardTitle>
        {departments.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{ru.common.department}:</span>
            <Select aria-label="Фильтр по отделу" value={dept} onChange={(e) => setDept(e.target.value)} className="w-44">
              <option value="">все</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
        )}
      </CardHeader>
      {error && <p role="alert" className="px-6 pb-3 text-sm text-danger">{error}</p>}
      <CardContent className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>{ru.common.employee}</TH>
              <TH>{ru.common.department}</TH>
              <TH>{ru.nav.interview}</TH>
              <TH>{ru.common.date}</TH>
              <TH>{ru.common.actions}</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.length === 0 && (
              <TR>
                <TD colSpan={5} className="text-center text-muted">
                  {rows.length === 0 ? "Пока нет сотрудников. Передайте им код приглашения выше." : "В этом отделе нет сотрудников."}
                </TD>
              </TR>
            )}
            {filtered.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium"><Link className="hover:underline" href={`/dashboard/projects/employees/${e.id}`}>{e.name}</Link></TD>
                <TD>{e.department}</TD>
                <TD>
                  <Badge variant={statusBadgeVariant(e.status)}>{statusLabel(e.status)}</Badge>
                </TD>
                <TD>{e.date}</TD>
                <TD><div className="flex items-center gap-2"><Link className="text-sm text-ink hover:underline" href={`/dashboard/projects/employees/${e.id}`}>Задачи</Link><Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" disabled={busy} onClick={() => void removeEmployee(e.id, e.name)}>{ru.common.delete}</Button></div></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function OrgProgressCards({
  total,
  interviewDone,
}: {
  total: number;
  interviewDone: number;
}) {
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[11px] uppercase tracking-wider text-muted">Сотрудников</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-head text-4xl font-medium tracking-tight">{total}</div>
          <p className="mt-3 text-xs text-muted">в организации</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-mono text-[11px] uppercase tracking-wider text-muted">Интервью пройдено</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-head text-4xl font-medium tracking-tight">{pct(interviewDone)}%</div>
          <p className="mt-3 text-xs text-muted">{interviewDone} из {total} сотрудников завершили интервью</p>
          <Progress value={pct(interviewDone)} className="mt-4" />
        </CardContent>
      </Card>
    </div>
  );
}

export { formatDate };

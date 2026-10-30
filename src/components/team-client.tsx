"use client";

import { Check, Copy, Users } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/brand";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export function TeamClient({
  inviteCode,
  orgName,
  employees,
}: {
  inviteCode: string;
  orgName: string;
  employees: { id: string; name: string; email: string; interview: string }[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeEmployee = async (id: string, name: string) => {
    if (!confirm(`Удалить сотрудника ${name}? Его данные будут стёрты.`)) return;
    const res = await fetch(`/api/team/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2"><Eyebrow>SYNAPT · КОМАНДА</Eyebrow><PageTitle>{ru.nav.team}</PageTitle><p className="max-w-2xl text-sm leading-relaxed text-muted">Соберите опыт людей, которые знают процессы изнутри.</p></div>

      <Card>
        <CardHeader>
          <CardTitle>Организация: {orgName}</CardTitle>
          <CardDescription>Передайте код сотрудникам — они введут его при регистрации</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <code className="rounded-[14px] bg-ink px-6 py-4 font-mono text-lg font-medium tracking-wider text-lime">
            {inviteCode}
          </code>
          <Button variant="outline" size="sm" onClick={copyCode}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Скопировано" : "Копировать"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-muted" />Сотрудники ({employees.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{ru.common.employee}</TH>
                <TH>Email</TH>
                <TH>{ru.nav.interview}</TH>
                <TH>{ru.common.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {employees.length === 0 && (
                <TR>
                  <TD colSpan={4} className="text-center text-muted">
                    {ru.common.empty}
                  </TD>
                </TR>
              )}
              {employees.map((e) => (
                <TR key={e.id}>
                  <TD className="font-medium">{e.name}</TD>
                  <TD className="text-muted">{e.email}</TD>
                  <TD>{e.interview === "✓" ? <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 font-mono text-[10px] uppercase text-ok"><Check className="h-3 w-3" />Пройдено</span> : <span className="text-muted">Не начато</span>}</TD>
                  <TD>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => removeEmployee(e.id, e.name)}
                    >
                      {ru.common.delete}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

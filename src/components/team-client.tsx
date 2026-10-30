"use client";

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
      <h1 className="text-2xl font-bold">{ru.nav.team}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Организация: {orgName}</CardTitle>
          <CardDescription>Передайте код сотрудникам — они введут его при регистрации</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <code className="rounded-lg bg-zinc-100 px-4 py-2 text-lg font-mono font-bold tracking-wider">
            {inviteCode}
          </code>
          <Button variant="outline" size="sm" onClick={copyCode}>
            {copied ? "Скопировано ✓" : "Копировать"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Сотрудники ({employees.length})</CardTitle>
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
                  <TD colSpan={4} className="text-center text-zinc-400">
                    {ru.common.empty}
                  </TD>
                </TR>
              )}
              {employees.map((e) => (
                <TR key={e.id}>
                  <TD className="font-medium">{e.name}</TD>
                  <TD className="text-zinc-500">{e.email}</TD>
                  <TD>{e.interview}</TD>
                  <TD>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
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

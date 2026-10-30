"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";

export function OrgSettings({
  initialRate,
  initialDepartments,
}: {
  initialRate: number;
  initialDepartments: string[];
}) {
  const router = useRouter();
  const [rate, setRate] = useState(String(initialRate));
  const [departments, setDepartments] = useState(initialDepartments.join(", "));
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    const res = await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hourlyRate: Number.parseFloat(rate.replace(",", ".")) || 0,
        departments: departments.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    setMsg(res.ok ? "✓ Сохранено" : ru.errors.generic);
    if (res.ok) router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройки организации</CardTitle>
        <CardDescription>
          Ставка (₽/час) используется в расчёте стоимости процессов; отделы помогают структурировать данные команды
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="hourly-rate">Ставка, ₽/час</Label>
          <Input id="hourly-rate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="departments">Отделы (через запятую)</Label>
          <Input id="departments" value={departments} onChange={(e) => setDepartments(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void save()}>Сохранить</Button>
          {msg && <span className="text-sm text-ok">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

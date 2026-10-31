"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TeamClient({ inviteCode, orgName }: { inviteCode: string; orgName: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${encodeURIComponent(inviteCode)}`);
      setError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Организация: {orgName}</CardTitle>
        <CardDescription>Отправьте ссылку сотрудникам. Они укажут имя и email и сразу перейдут к интервью.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void copyCode()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Скопировано" : "Копировать ссылку"}
        </Button>
        {error && <p role="alert" className="text-sm text-danger">Не удалось скопировать ссылку. Попробуйте ещё раз.</p>}
      </CardContent>
    </Card>
  );
}

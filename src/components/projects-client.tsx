"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { statusLabel } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea, FieldError } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status";
import { formatDate } from "@/lib/utils";

export interface ProjectRow {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  sourcesCount: number;
  conflictsCount: number;
}

export function ProjectsClient({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(projects.length === 0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setError(null);
    if (title.trim().length < 3) {
      setError("Название: минимум 3 символа");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setDescription("");
      setShowForm(false);
      router.refresh();
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(err?.error ?? ru.errors.generic);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{ru.projects.title}</h1>
          <p className="text-sm text-zinc-500">{ru.projects.subtitle}</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>{ru.projects.create}</Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label>{ru.projects.createTitle}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{ru.projects.createDesc}</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <FieldError>{error}</FieldError>
            <div className="flex gap-2">
              <Button onClick={() => void create()} disabled={busy}>
                {ru.common.create}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                {ru.common.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {projects.length === 0 && !showForm && (
          <p className="py-10 text-center text-zinc-400">{ru.projects.empty}</p>
        )}
        {projects.map((p) => (
          <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="block">
            <Card className="transition-colors hover:border-indigo-300">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <Badge variant={statusBadgeVariant(p.status)}>{statusLabel(p.status)}</Badge>
                    <span>
                      {p.sourcesCount} {ru.projects.sourcesCount}
                    </span>
                    {p.conflictsCount > 0 && (
                      <Badge variant="warning">⚠ {p.conflictsCount} конфликтов</Badge>
                    )}
                    <span>{formatDate(p.createdAt)}</span>
                  </div>
                </div>
                <span className="text-sm text-indigo-600">{ru.projects.open} →</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

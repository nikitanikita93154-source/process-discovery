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
import type { CandidateRow } from "@/lib/schemas/candidate";

export interface ProjectRow {
  id: string;
  title: string;
  description: string;
  status: string;
  origin: string;
  autoReason: string | null;
  createdAt: string;
  sourcesCount: number;
  conflictsCount: number;
}

const ORIGIN_LABELS: Record<string, string> = {
  interview: ru.candidates.originInterview,
  t1: ru.candidates.originT1,
  document: ru.candidates.originDocument,
};

export function ProjectsClient({
  projects,
  candidates,
}: {
  projects: ProjectRow[];
  candidates: CandidateRow[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(projects.length === 0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);

  const decide = async (id: string, action: "accept" | "dismiss") => {
    setBusy(true);
    const res = await fetch(`/api/candidates/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(ru.errors.generic);
  };

  const discoverT1 = async () => {
    setDiscovering(true);
    setDiscoverMsg(null);
    try {
      const res = await fetch("/api/candidates", { method: "POST" });
      const data = (await res.json()) as { created?: number; clusters?: number; error?: string };
      setDiscoverMsg(
        res.ok
          ? `${ru.candidates.discovered}: ${data.clusters ?? 0}, ${ru.candidates.created}: ${data.created ?? 0}`
          : (data.error ?? ru.errors.generic),
      );
      router.refresh();
    } catch {
      setDiscoverMsg(ru.errors.network);
    } finally {
      setDiscovering(false);
    }
  };

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void discoverT1()} disabled={discovering}>
            {discovering ? ru.candidates.discovering : ru.candidates.discoverT1}
          </Button>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>{ru.projects.create}</Button>
          )}
        </div>
      </div>

      {discoverMsg && <p className="text-sm text-indigo-600">{discoverMsg}</p>}

      {/* Найденные процессы (кандидаты) */}
      {candidates.length > 0 && (
        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardContent className="space-y-2 p-4">
            <h2 className="font-semibold text-indigo-800">
              {ru.candidates.title} ({candidates.length})
            </h2>
            <p className="text-xs text-zinc-500">{ru.candidates.subtitle}</p>
            <div className="space-y-2">
              {candidates.map((c) => (
                <div key={c.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.title}</span>
                        <Badge variant="secondary">{ORIGIN_LABELS[c.origin] ?? c.origin}</Badge>
                      </div>
                      {c.description && <p className="mt-1 text-sm text-zinc-600">{c.description}</p>}
                      {c.evidence.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-zinc-500">{ru.candidates.evidence}:</span>
                          <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                            {c.evidence.slice(0, 5).map((e, i) => (
                              <li key={i}>
                                • {e.who}: {e.what}
                                {e.ref ? ` (${e.ref})` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => void decide(c.id, "accept")} disabled={busy}>
                        {ru.candidates.accept}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void decide(c.id, "dismiss")} disabled={busy}>
                        {ru.candidates.dismiss}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    {p.origin !== "manual" && (
                      <Badge variant="default" title={p.autoReason ?? ru.candidates.autoFrom}>
                        ⚡ {ru.candidates.autoBadge}
                      </Badge>
                    )}
                  </div>
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

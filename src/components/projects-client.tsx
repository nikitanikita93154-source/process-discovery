"use client";

import { ArrowUpRight, Sparkles, Users, TriangleAlert, Plus } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/brand";
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
  /** Сотрудники, чьи интервью описали процесс проекта. */
  employees: string[];
}

const ORIGIN_LABELS: Record<string, string> = {
  interview: ru.candidates.originInterview,
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="space-y-2"><Eyebrow>SYNAPT · ПРОЦЕССЫ</Eyebrow><PageTitle>{ru.projects.title}</PageTitle></div>
          <p className="mt-3 text-sm text-muted">{ru.projects.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {!showForm && (
            <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />{ru.projects.create}</Button>
          )}
        </div>
      </div>

      {/* Найденные процессы (кандидаты) */}
      {candidates.length > 0 && (
        <Card className="border-line-warm bg-accent-soft">
          <CardContent className="space-y-2 p-4">
            <h2 className="flex items-center gap-2 font-head text-sm font-medium text-accent-dark">
              <Sparkles className="h-4 w-4" />{ru.candidates.title} ({candidates.length})
            </h2>
            <p className="text-xs text-muted">{ru.candidates.subtitle}</p>
            <div className="space-y-2">
              {candidates.map((c) => (
                <div key={c.id} className="rounded-[14px] border border-line bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.title}</span>
                        <Badge variant="secondary">{ORIGIN_LABELS[c.origin] ?? c.origin}</Badge>
                      </div>
                      {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                      {c.evidence.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-muted">{ru.candidates.evidence}:</span>
                          <ul className="mt-1 space-y-0.5 text-xs text-muted">
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
              <Label htmlFor="project-title">{ru.projects.createTitle}</Label>
              <Input id="project-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-description">{ru.projects.createDesc}</Label>
              <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} />
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
          <p className="py-10 text-center text-muted">{ru.projects.empty}</p>
        )}
        {projects.map((p) => (
          <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="group block rounded-[22px]">
            <Card className="transition-colors hover:border-ink hover:bg-cream">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium">{p.title}</span>
                    {p.origin !== "manual" && (
                      <Badge variant="accent" title={p.autoReason ?? ru.candidates.autoFrom}>
                        <Sparkles className="h-3 w-3" /> {ru.candidates.autoBadge}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge variant={statusBadgeVariant(p.status)}>{statusLabel(p.status)}</Badge>
                    <span>
                      {p.sourcesCount} {ru.projects.sourcesCount}
                    </span>
                    {p.employees.length > 0 && (
                      <span title={ru.projects.employeesHint}>
                        <Users className="mr-1 inline h-3 w-3" aria-hidden="true" />{ru.projects.employees}: {p.employees.join(", ")}
                      </span>
                    )}
                    {p.conflictsCount > 0 && (
                      <Badge variant="warning"><TriangleAlert className="h-3 w-3" /> {p.conflictsCount} конфликтов</Badge>
                    )}
                    <span>{formatDate(p.createdAt)}</span>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm text-ink transition-colors group-hover:bg-lime">{ru.projects.open}<ArrowUpRight className="h-4 w-4" /></span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

"use client";

import { UploadCloud, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeVariant } from "@/lib/status";
import type { ParsedSource } from "@/lib/schemas/source";
import type { ContributingInterview } from "@/lib/agent/employees";

export interface SourceRow {
  id: string;
  type: string;
  name: string;
  status: string;
  parsed: ParsedSource | null;
  createdAt: string;
}

export interface ConflictRow {
  id: string;
  description: string;
  resolved: boolean;
  docSourceName: string;
}

export function SourcesClient({
  projectId,
  sources,
  contributors,
  conflicts,
}: {
  projectId: string;
  sources: SourceRow[];
  /** Интервью, из которых берётся процесс проекта (включая внешние). */
  contributors: ContributingInterview[];
  conflicts: ConflictRow[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/projects/${projectId}/sources`, { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as
        | { source?: { name: string; status: string }; conflictsCreated?: number; warning?: string; error?: string }
        | null;
      if (!res.ok) {
        setMessage({ kind: "err", text: data?.error ?? ru.errors.generic });
      } else if (data?.warning) {
        setMessage({ kind: "warn", text: data.warning });
      } else {
        setMessage({
          kind: "ok",
          text: `Документ «${data?.source?.name}» обработан` + (data?.conflictsCreated ? `, найдено конфликтов: ${data.conflictsCreated}` : ""),
        });
      }
      router.refresh();
    } catch {
      setMessage({ kind: "err", text: ru.errors.network });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const deleteSource = async (id: string) => {
    if (!confirm("Удалить источник?")) return;
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const resolveConflict = async (id: string) => {
    await fetch(`/api/conflicts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    router.refresh();
  };

  const [showCitations, setShowCitations] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Из чьих интервью берётся процесс (включая внешние источники) */}
      {contributors.length > 0 && (
        <Card className="border-lime/40 bg-lime-soft">
          <CardContent className="p-4">
            <div className="text-sm font-semibold text-ink">{ru.project.contributorsTitle}</div>
            <div className="mt-2 space-y-1.5 text-sm">
              {contributors.map((c) => (
                <div key={c.sourceId} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{c.employeeName}</span>
                  {c.direct ? (
                    <Badge variant="secondary">{ru.project.contributorDirect}</Badge>
                  ) : (
                    <span className="text-xs text-muted">
                      {ru.project.contributorExternal}
                      {c.hostProjectTitle ? ` «${c.hostProjectTitle}»` : ""}
                      {c.matchedProcess ? ` — «${c.matchedProcess}»` : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Конфликты */}
      {conflicts.length > 0 && (
        <Card className="border-warn/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-warn">
              <TriangleAlert className="h-4 w-4" /> {ru.project.conflictsTitle}
              <Badge variant="warning">{conflicts.filter((c) => !c.resolved).length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conflicts.map((c) => (
              <div
                key={c.id}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-[14px] border p-3 text-sm ${
                  c.resolved ? "border-line bg-paper text-muted" : "border-warn/20 bg-warn-soft"
                }`}
              >
                <div>
                  <div className="font-medium">{c.docSourceName}</div>
                  <p className="mt-1 text-ink">{c.description}</p>
                </div>
                {!c.resolved && (
                  <Button size="sm" variant="outline" onClick={() => void resolveConflict(c.id)}>
                    {ru.project.conflictResolve}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Загрузка */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5 text-accent" />{ru.project.uploadTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted">{ru.project.uploadHint}</p>
          <div className="rounded-[14px] border border-dashed border-line-warm bg-paper p-5 sm:p-6">
          <input
            aria-label="Загрузить документ PDF, DOCX или XLSX"
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.xlsx"
            className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-lime hover:file:bg-ink/85"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          </div>
          {uploading && <p className="text-sm text-ink">{ru.project.uploading}</p>}
          {message && (
            <p
              className={`text-sm ${
                message.kind === "ok" ? "text-ok" : message.kind === "warn" ? "text-warn" : "text-danger"
              }`}
            >
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Список источников */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
            {ru.project.sourcesList} ({sources.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sources.length === 0 && <p className="py-6 text-center text-muted">{ru.project.noSources}</p>}
          {sources.map((s) => (
            <div key={s.id} className="rounded-[14px] border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.type === "interview" ? "default" : "secondary"}>
                    {s.type === "interview" ? ru.project.typeInterview : ru.project.typeDocument}
                  </Badge>
                  <span className="font-medium">{s.name}</span>
                  <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {s.parsed && (
                    <span className="text-xs text-muted">
                      {s.parsed.candidateSteps.length} {ru.project.parsedSteps} · {s.parsed.rules.length}{" "}
                      {ru.project.parsedRules} · {s.parsed.actors.length} {ru.project.parsedActors}
                    </span>
                  )}
                  {s.parsed && (
                    <Button size="sm" variant="ghost" onClick={() => setShowCitations(showCitations === s.id ? null : s.id)}>
                      {ru.project.citations}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => void deleteSource(s.id)}>
                    {ru.common.delete}
                  </Button>
                </div>
              </div>
              {showCitations === s.id && s.parsed && (
                <div className="mt-3 space-y-2 rounded-[14px] bg-paper p-3 text-sm">
                  <div className="font-medium text-muted">{ru.project.citations}:</div>
                  <ul className="list-disc space-y-1 pl-5 text-muted">
                    {s.parsed.citations.map((c, i) => (
                      <li key={i}>{c.ref}</li>
                    ))}
                  </ul>
                  {s.parsed.rules.length > 0 && (
                    <>
                      <div className="font-medium text-muted">{ru.project.parsedRules}:</div>
                      <ul className="list-disc space-y-1 pl-5 text-muted">
                        {s.parsed.rules.map((r, i) => (
                          <li key={i}>
                            {r.text} {r.source && <span className="text-muted">({r.source})</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

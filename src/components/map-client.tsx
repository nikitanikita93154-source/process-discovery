"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import type { ProcessMapJson } from "@/lib/schemas/map";
import type { MapDiffEntry } from "@/lib/map/diff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils";
import { ProcessCanvas, type CommentRow } from "@/components/process-canvas";

export function MapClient({
  projectId,
  map,
  versions,
  sourceNames,
  comments,
  followUps,
}: {
  projectId: string;
  map: { id: string; version: number; author: string; createdAt: string; json: ProcessMapJson } | null;
  versions: { id: string; version: number; author: string; createdAt: string }[];
  sourceNames: Record<string, string>;
  comments: CommentRow[];
  followUps: { id: string; text: string; status: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [diff, setDiff] = useState<MapDiffEntry[] | null>(null);
  const [preview, setPreview] = useState<ProcessMapJson | null>(null);

  const build = async () => {
    setBusy(true);
    setError(null);
    setOkMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/map/build`, { method: "POST" });
      const data = (await res.json()) as {
        requiresApproval?: boolean;
        diff?: MapDiffEntry[];
        preview?: ProcessMapJson;
        json?: ProcessMapJson;
        version?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? ru.errors.generic);
      } else if (data.requiresApproval) {
        setDiff(data.diff ?? []);
        setPreview(data.preview ?? null);
      } else {
        setOkMessage(`${ru.map.buildSuccess} v${data.version}`);
        router.refresh();
      }
    } catch {
      setError(ru.errors.network);
    } finally {
      setBusy(false);
    }
  };

  const acceptNewVersion = async () => {
    if (!preview) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/map/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: preview, acceptAi: true }),
    });
    setBusy(false);
    if (res.ok) {
      setDiff(null);
      setPreview(null);
      setOkMessage(ru.map.savedOk);
      router.refresh();
    } else {
      setError(ru.errors.generic);
    }
  };

  const noCitationCount = map
    ? map.json.stages.reduce((acc, s) => acc + s.steps.filter((st) => st.citations.length === 0).length, 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button onClick={() => void build()} disabled={busy}>
            {busy ? ru.project.building : ru.project.buildMap}
          </Button>
          {map && (
            <>
              <Badge variant="secondary">
                {ru.map.version} {map.version} · {map.author === "ai" ? ru.map.authorAi : ru.map.authorHuman}
              </Badge>
              {noCitationCount > 0 && (
                <Badge variant="warning">
                  ⚠ {noCitationCount} {ru.map.warningsCount}
                </Badge>
              )}
              <span className="text-xs text-zinc-400">{formatDateTime(map.createdAt)}</span>
            </>
          )}
        </div>
        {versions.length > 1 && (
          <span className="text-xs text-zinc-400">
            {ru.map.version.toLowerCase()}ы: {versions.map((v) => `v${v.version}(${v.author === "ai" ? "AI" : "чел."})`).join(", ")}
          </span>
        )}
      </div>

      {okMessage && <p className="text-sm text-emerald-600">{okMessage}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!map && !busy && <p className="py-10 text-center text-zinc-400">{ru.map.empty}</p>}

      {followUps.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-amber-700">
              Вопросы для следующего интервью ({followUps.filter((f) => f.status === "open").length} открытых)
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {followUps.map((f) => (
                <li key={f.id}>
                  {f.status === "asked" ? "✓" : "•"} {f.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {map && (
        <ProcessCanvas
          projectId={projectId}
          mapId={map.id}
          initialJson={map.json}
          sourceNames={sourceNames}
          initialComments={comments}
        />
      )}

      {/* Diff-диалог при rebuild поверх человеческих правок */}
      <Dialog open={diff !== null} onOpenChange={(open) => !open && setDiff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ru.map.diffTitle}</DialogTitle>
            <DialogDescription>{ru.map.buildRequiresApproval}</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto thin-scroll">
            {(diff ?? []).length === 0 && <p className="text-sm text-zinc-400">{ru.map.diffEmpty}</p>}
            {(diff ?? []).map((d, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-zinc-200 p-2 text-sm">
                <Badge
                  variant={d.kind === "added" ? "success" : d.kind === "removed" ? "destructive" : "warning"}
                >
                  {d.kind === "added" ? ru.map.addedStep : d.kind === "removed" ? ru.map.removedStep : ru.map.changedStep}
                </Badge>
                <div>
                  <span className="font-medium">{d.step}</span>
                  <span className="text-zinc-400"> · {d.stage}</span>
                  <div className="text-xs text-zinc-500">{d.details}</div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiff(null)}>
              {ru.map.discardNewVersion}
            </Button>
            <Button onClick={() => void acceptNewVersion()} disabled={busy}>
              {ru.map.acceptNewVersion}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

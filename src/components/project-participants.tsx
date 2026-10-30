"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { statusLabel } from "@/lib/status";

export interface ParticipantRow {
  id: string;
  name: string;
  department: string;
  interview: string;
}

export interface AvailableEmployee {
  id: string;
  name: string;
  department: string;
  tasksMatch: boolean;
}

export function ProjectParticipants({
  projectId,
  participants,
  available,
}: {
  projectId: string;
  participants: ParticipantRow[];
  available: AvailableEmployee[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (userIds: string[]) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    });
    setBusy(false);
    if (res.ok) {
      setPicked("");
      router.refresh();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? ru.errors.generic);
    }
  };

  const add = () => {
    if (!picked) return;
    void save([...participants.map((p) => p.id), picked]);
  };

  const remove = (userId: string) => {
    void save(participants.map((p) => p.id).filter((id) => id !== userId));
  };

  return (
    <div className="rounded-[22px] border border-ok/20 bg-ok-soft p-4">
      <h3 className="font-head text-sm font-medium text-ok">{ru.participants.title}</h3>
      <p className="mt-0.5 text-xs text-muted">{ru.participants.hint}</p>

      <div className="mt-3 space-y-1.5">
        {participants.length === 0 && (
          <p className="text-sm text-muted">{ru.participants.empty}</p>
        )}
        {participants.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-[14px] bg-white px-3 py-2 text-sm">
            <span className="font-medium">{p.name}</span>
            <span className="text-xs text-muted">{p.department}</span>
            <span className="ml-auto flex items-center gap-1.5 text-xs">
              <span className="rounded bg-cream px-1.5 py-0.5">
                {ru.participants.interview}: {statusLabel(p.interview)}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-danger" onClick={() => remove(p.id)} disabled={busy}>
                {ru.participants.remove}
              </Button>
            </span>
          </div>
        ))}
      </div>

      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select aria-label="Выбрать сотрудника" value={picked} onChange={(e) => setPicked(e.target.value)} className="w-full sm:w-64" disabled={busy}>
            <option value="">{ru.participants.pick}</option>
            {available.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.department}){e.tasksMatch ? ` — ${ru.participants.tasksMatch}` : ""}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={add} disabled={busy || !picked}>
            + {ru.participants.add}
          </Button>
          <span className="text-xs text-muted">{ru.participants.addHint}</span>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

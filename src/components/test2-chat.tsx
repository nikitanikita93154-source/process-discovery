"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import type { AgentTurn, InterviewSummary, TranscriptItem } from "@/lib/schemas/test2";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, Input, Textarea } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface Test2SessionState {
  id: string;
  status: string;
  agenda: string[];
  coverage: { topics: Record<string, string>; followUps: number };
  transcript: TranscriptItem[];
  currentTopic: string;
  topicNumber: number;
  topicsTotal: number;
  summary: InterviewSummary | null;
}

interface StreamEvents {
  onSession: (data: Record<string, unknown>) => void;
  onTurn: (turn: AgentTurn) => void;
  onSummary: (summary: InterviewSummary) => void;
  onError: (message: string) => void;
  onDone: (data: Record<string, unknown>) => void;
}

async function postStream(payload: Record<string, unknown>, handlers: StreamEvents) {
  const res = await fetch("/api/test2/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    handlers.onError(err?.error ?? ru.errors.network);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      let event = "message";
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as unknown;
        switch (event) {
          case "session":
            handlers.onSession(parsed as Record<string, unknown>);
            break;
          case "turn":
            handlers.onTurn(parsed as AgentTurn);
            break;
          case "summary":
            handlers.onSummary(parsed as InterviewSummary);
            break;
          case "error":
            handlers.onError((parsed as { message: string }).message);
            break;
          case "done":
            handlers.onDone(parsed as Record<string, unknown>);
            break;
          default:
            break;
        }
      } catch {
        // игнорируем битые фрагменты
      }
    }
  }
}

export function Test2Chat({ initialSession }: { initialSession: Test2SessionState | null }) {
  const router = useRouter();
  const [session, setSession] = useState<Test2SessionState | null>(initialSession);
  const [messages, setMessages] = useState<TranscriptItem[]>(initialSession?.transcript ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [artifact, setArtifact] = useState<AgentTurn["proposed_artifact"] | null>(null);
  const [editingArtifact, setEditingArtifact] = useState(false);
  const [artifactEditValue, setArtifactEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InterviewSummary | null>(initialSession?.summary ?? null);
  const [needsConfirm, setNeedsConfirm] = useState(initialSession?.status === "awaiting_confirmation");
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(Boolean(initialSession));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runStream = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      setQuickReplies([]);
      await postStream(
        { ...(session ? { sessionId: session.id } : {}), ...payload },
        {
          onSession: (data) => {
            const s = data as unknown as {
              sessionId: string;
              status: string;
              agenda: string[];
              coverage: { topics: Record<string, string>; followUps: number };
              currentTopic?: string;
            };
            setSession((prev) => ({
              id: s.sessionId,
              status: s.status,
              agenda: s.agenda ?? prev?.agenda ?? [],
              coverage: s.coverage ?? { topics: {}, followUps: 0 },
              transcript: prev?.transcript ?? [],
              currentTopic: s.currentTopic ?? prev?.currentTopic ?? "",
              topicNumber: prev?.topicNumber ?? 1,
              topicsTotal: s.agenda?.length ?? prev?.topicsTotal ?? 1,
              summary: prev?.summary ?? null,
            }));
            if (s.status === "awaiting_confirmation") setNeedsConfirm(true);
          },
          onTurn: (turn) => {
            setMessages((prev) => [...prev, { role: "assistant", text: turn.message, ts: new Date().toISOString() }]);
            if (turn.proposed_artifact) {
              setArtifact(turn.proposed_artifact);
              setEditingArtifact(false);
              setArtifactEditValue("");
            }
            if (turn.quick_replies && turn.quick_replies.length > 0) setQuickReplies(turn.quick_replies);
          },
          onSummary: (s) => {
            setSummary(s);
            setNeedsConfirm(true);
          },
          onError: (message) => setError(message),
          onDone: (data) => {
            if (data.completed === true || data.timeLimit === true) {
              if (data.timeLimit === true) setNeedsConfirm(true);
              else router.push("/me/done");
            }
          },
        },
      );
      setBusy(false);
    },
    [session, router],
  );

  // Стартовое приветствие агента при новой сессии
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void runStream({});
    }
  }, [runStream]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: trimmed, ts: new Date().toISOString() }]);
    await runStream({ message: trimmed });
  };

  const sendArtifactDecision = async (
    decision: "accept" | "edit" | "reject",
    name: string,
    newName?: string,
  ) => {
    if (!artifact || busy) return;
    setArtifact(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text:
          decision === "accept"
            ? `${ru.test2.artifactAccept}: «${name}»`
            : decision === "edit"
              ? `${ru.test2.artifactEdit}: «${name}» → «${newName ?? name}»`
              : `${ru.test2.artifactReject}: «${name}»`,
        ts: new Date().toISOString(),
      },
    ]);
    await runStream({ artifact: { decision, name, newName } });
  };

  const topicNumber = session?.topicNumber ?? 1;
  const topicsTotal = session?.topicsTotal ?? 1;
  const currentTopic = session?.currentTopic ?? "";

  // ---------- Экран подтверждения резюме ----------
  if (needsConfirm && summary) {
    return (
      <ConfirmScreen
        sessionId={session?.id ?? ""}
        initialSummary={summary}
        onBackToChat={() => setNeedsConfirm(false)}
      />
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col space-y-3">
      <div>
        <h1 className="text-2xl font-bold">{ru.test2.title}</h1>
        <p className="text-sm text-zinc-500">{ru.test2.subtitle}</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="font-medium text-indigo-600">
            {ru.test2.topicProgress} {topicNumber} {ru.test2.topicOf} {topicsTotal}
            {currentTopic ? `: ${currentTopic}` : ""}
          </span>
          <span>{busy ? "агент печатает…" : ""}</span>
        </div>
        <Progress value={(topicNumber / Math.max(topicsTotal, 1)) * 100} />
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="thin-scroll h-full space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-zinc-100 text-zinc-900 rounded-bl-sm",
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm text-zinc-400">…</div>
            </div>
          )}

          {artifact && (
            <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                {ru.test2.artifactTitle} · {artifact.action}
              </div>
              <div className="mt-1 font-medium">{artifact.name}</div>
              {artifact.details && <p className="mt-1 text-sm text-zinc-600">{artifact.details}</p>}
              {editingArtifact ? (
                <div className="mt-3 space-y-2">
                  <Input
                    autoFocus
                    placeholder={ru.test2.artifactEditPlaceholder}
                    value={artifactEditValue}
                    onChange={(e) => setArtifactEditValue(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void sendArtifactDecision("edit", artifact.name, artifactEditValue || artifact.name)}
                    >
                      {ru.test2.artifactEditSave}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingArtifact(false)}>
                      {ru.common.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="success" onClick={() => void sendArtifactDecision("accept", artifact.name)}>
                    {ru.test2.artifactAccept}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingArtifact(true)}>
                    {ru.test2.artifactEdit}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void sendArtifactDecision("reject", artifact.name)}>
                    {ru.test2.artifactReject}
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {quickReplies.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2">
          {quickReplies.map((q) => (
            <Button key={q} size="sm" variant="outline" onClick={() => void sendMessage(q)}>
              {q}
            </Button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ru.test2.inputPlaceholder}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          {ru.test2.send}
        </Button>
      </form>

      <div className="flex justify-between">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runStream({ command: "SKIP" })}>
          {ru.test2.skipCommand}
        </Button>
        <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={() => void runStream({ command: "STOP" })}>
          {ru.test2.stopCommand}
        </Button>
      </div>
    </div>
  );
}

// ---------- Экран подтверждения ----------

function ConfirmScreen({
  sessionId,
  initialSummary,
  onBackToChat: _onBackToChat,
}: {
  sessionId: string;
  initialSummary: InterviewSummary;
  onBackToChat: () => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<InterviewSummary>(initialSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProcess = (i: number, patch: Partial<InterviewSummary["processes"][number]>) => {
    setSummary((prev) => ({
      ...prev,
      processes: prev.processes.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    }));
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/test2/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, summary }),
    });
    if (res.ok) {
      router.push("/me/done");
      router.refresh();
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(err?.error ?? ru.errors.generic);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{ru.test2.confirmTitle}</h1>
        <p className="text-sm text-zinc-500">{ru.test2.confirmSubtitle}</p>
      </div>

      <div className="space-y-4">
        <h2 className="font-semibold">{ru.test2.confirmProcesses}</h2>
        {summary.processes.map((p, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Input value={p.name} onChange={(e) => updateProcess(i, { name: e.target.value })} className="font-medium" />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() =>
                    setSummary((prev) => ({ ...prev, processes: prev.processes.filter((_, idx) => idx !== i) }))
                  }
                >
                  ✕
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-zinc-500">{ru.test2.processSteps}</span>
                  <Textarea
                    value={p.steps.join("\n")}
                    onChange={(e) => updateProcess(i, { steps: e.target.value.split("\n").filter(Boolean) })}
                  />
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-zinc-500">{ru.test2.processActors}</span>
                    <Input
                      value={p.actors.join(", ")}
                      onChange={(e) => updateProcess(i, { actors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-zinc-500">{ru.test2.processSystems}</span>
                    <Input
                      value={p.systems.join(", ")}
                      onChange={(e) => updateProcess(i, { systems: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-zinc-500">{ru.test2.processVolume}</span>
                  <Input value={p.volume} onChange={(e) => updateProcess(i, { volume: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-zinc-500">{ru.test2.processPain}</span>
                  <Input value={p.pain} onChange={(e) => updateProcess(i, { pain: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setSummary((prev) => ({
              ...prev,
              processes: [...prev.processes, { name: "", steps: [], actors: [], systems: [], volume: "", pain: "" }],
            }))
          }
        >
          + {ru.test2.addProcess}
        </Button>

        <h2 className="font-semibold">{ru.test2.confirmOpenQuestions}</h2>
        <div className="space-y-2">
          {summary.open_questions.map((q, i) => (
            <Input
              key={i}
              value={q}
              onChange={(e) =>
                setSummary((prev) => ({
                  ...prev,
                  open_questions: prev.open_questions.map((x, idx) => (idx === i ? e.target.value : x)),
                }))
              }
            />
          ))}
        </div>
      </div>

      {error && <FieldError>{error}</FieldError>}
      <Button size="lg" onClick={() => void confirm()} disabled={busy}>
        {busy ? ru.common.loading : ru.test2.confirmButton}
      </Button>
    </div>
  );
}

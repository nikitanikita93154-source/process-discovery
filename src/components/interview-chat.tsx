"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import type { AgentTurn, InterviewSummary, TranscriptItem } from "@/lib/schemas/interview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface InterviewSessionState {
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
}

async function postStream(payload: Record<string, unknown>, handlers: StreamEvents) {
  const res = await fetch("/api/interview/stream", {
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
          default:
            // done и неизвестные события — завершение кадра, действий не требуется
            break;
        }
      } catch {
        // игнорируем битые фрагменты
      }
    }
  }
}

export function InterviewChat({ initialSession }: { initialSession: InterviewSessionState | null }) {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSessionState | null>(initialSession);
  const [messages, setMessages] = useState<TranscriptItem[]>(initialSession?.transcript ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<InterviewSummary | null>(initialSession?.summary ?? null);
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Первый ход агента нужен, если транскрипт пуст или заканчивается
  // неотвеченным сообщением сотрудника (ход, прерванный сбоем)
  const initialTranscript = initialSession?.transcript ?? [];
  const hasPendingUser = initialTranscript.length > 0 && initialTranscript[initialTranscript.length - 1].role === "user";
  const startedRef = useRef(initialTranscript.length > 0 && !hasPendingUser);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, summary]);

  const resizeTextarea = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const runStream = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
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
              topicNumber?: number;
            };
            setSession((prev) => ({
              id: s.sessionId,
              status: s.status,
              agenda: s.agenda ?? prev?.agenda ?? [],
              coverage: s.coverage ?? { topics: {}, followUps: 0 },
              transcript: prev?.transcript ?? [],
              currentTopic: s.currentTopic ?? prev?.currentTopic ?? "",
              topicNumber: typeof s.topicNumber === "number" ? s.topicNumber : (prev?.topicNumber ?? 1),
              topicsTotal: s.agenda?.length ?? prev?.topicsTotal ?? 1,
              summary: prev?.summary ?? null,
            }));
          },
          onTurn: (turn) => {
            setMessages((prev) => [...prev, { role: "assistant", text: turn.message, ts: new Date().toISOString() }]);
          },
          onSummary: (s) => setSummary(s),
          onError: (message) => setError(message),
        },
      );
      setBusy(false);
    },
    [session],
  );

  // Первый ход агента: приветствие при пустом транскрипте или ответ на
  // «висящее» неотвеченное сообщение после сбоя/перезагрузки
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
    requestAnimationFrame(resizeTextarea);
    // Повторная отправка того же текста (ретрай после ошибки) не дублируется
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "user" && last.text === trimmed) return prev;
      return [...prev, { role: "user", text: trimmed, ts: new Date().toISOString() }];
    });
    await runStream({ message: trimmed });
  };

  const confirmSummary = async () => {
    if (!session || busy || confirming) return;
    setConfirming(true);
    setError(null);
    const res = await fetch("/api/interview/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    });
    if (res.ok) {
      router.push("/me/done");
      router.refresh();
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(err?.error ?? ru.errors.generic);
      setConfirming(false);
    }
  };

  const topicNumber = session?.topicNumber ?? 1;
  const topicsTotal = session?.topicsTotal ?? 1;
  const currentTopic = session?.currentTopic ?? "";
  const awaitingConfirmation = summary !== null;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col space-y-3">
      <div>
        <h1 className="text-2xl font-bold">{ru.interview.title}</h1>
        <p className="text-sm text-zinc-500">{ru.interview.subtitle}</p>
      </div>

      {!awaitingConfirmation && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="font-medium text-indigo-600">
              {ru.interview.topicProgress} {topicNumber} {ru.interview.topicOf} {topicsTotal}
              {currentTopic ? `: ${currentTopic}` : ""}
            </span>
            <span>{busy ? ru.interview.typing : ""}</span>
          </div>
          <Progress value={(topicNumber / Math.max(topicsTotal, 1)) * 100} />
        </div>
      )}

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

          {summary && (
            <SummaryCard
              summary={summary}
              confirming={confirming}
              disabled={busy}
              onConfirm={() => void confirmSummary()}
            />
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
      >
        <textarea
          ref={taRef}
          rows={3}
          value={input}
          placeholder={ru.interview.inputPlaceholder}
          disabled={busy}
          onChange={(e) => {
            setInput(e.target.value);
            resizeTextarea();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage(input);
            }
          }}
          className="thin-scroll flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
        />
        <div className="flex flex-col items-stretch gap-1">
          <Button type="submit" disabled={busy || !input.trim()}>
            {ru.interview.send}
          </Button>
          {!awaitingConfirmation && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-zinc-400"
              disabled={busy}
              onClick={() => void runStream({ command: "STOP" })}
            >
              {ru.interview.finishEarly}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------- Карточка резюме прямо в диалоге ----------

function SummaryCard({
  summary,
  confirming,
  disabled,
  onConfirm,
}: {
  summary: InterviewSummary;
  confirming: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const employeeLine = [summary.employee?.position, summary.employee?.department].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          {ru.interview.summaryTitle}
        </div>
        {employeeLine && <div className="text-xs text-zinc-500">{employeeLine}</div>}
      </div>

      {summary.processes.length === 0 && (
        <p className="text-sm text-zinc-500">{ru.interview.noProcesses}</p>
      )}

      {summary.processes.map((p, i) => (
        <div key={i} className="space-y-1.5 rounded-xl bg-white p-3 text-sm">
          <div className="font-medium">{p.name}</div>
          {p.steps.length > 0 && (
            <div>
              <span className="text-xs font-medium text-zinc-500">{ru.interview.processSteps}:</span>
              <ol className="ml-4 list-decimal text-zinc-700">
                {p.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          <div className="grid gap-x-4 gap-y-1 text-zinc-700 sm:grid-cols-2">
            {p.actors.length > 0 && (
              <div>
                <span className="text-xs font-medium text-zinc-500">{ru.interview.processActors}: </span>
                {p.actors.join(", ")}
              </div>
            )}
            {p.systems.length > 0 && (
              <div>
                <span className="text-xs font-medium text-zinc-500">{ru.interview.processSystems}: </span>
                {p.systems.join(", ")}
              </div>
            )}
            {p.volume && (
              <div>
                <span className="text-xs font-medium text-zinc-500">{ru.interview.processVolume}: </span>
                {p.volume}
              </div>
            )}
            {p.pain && (
              <div>
                <span className="text-xs font-medium text-zinc-500">{ru.interview.processPain}: </span>
                {p.pain}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* open_questions сознательно не показываем сотруднику:
          это вопросы для владельца/аналитика, хранятся в БД */}

      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-zinc-500">{ru.interview.confirmHint}</p>
        <Button onClick={onConfirm} disabled={confirming || disabled} className="shrink-0">
          {confirming ? ru.common.loading : ru.interview.confirmButton}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ru } from "@/lib/content/ru";
import type { AgentTurn, InterviewSummary, TranscriptItem } from "@/lib/schemas/interview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VoiceInput } from "@/components/voice-input";
import { InterviewGuide } from "@/components/interview-guide";

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
  let finished = false;
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
            finished = true;
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
  if (!finished) throw new Error("Поток ответа прерван");
}

export function InterviewChat({ initialSession }: { initialSession: InterviewSessionState | null }) {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSessionState | null>(initialSession);
  const [messages, setMessages] = useState<TranscriptItem[]>(initialSession?.transcript ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<InterviewSummary | null>(initialSession?.summary ?? null);
  const [confirming, setConfirming] = useState(false);
  const [showGuide, setShowGuide] = useState(() => !initialSession || (initialSession.transcript.length === 0 && !initialSession.summary));
  const messagesRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Первый ход агента нужен, если транскрипт пуст или заканчивается
  // неотвеченным сообщением сотрудника (ход, прерванный сбоем)
  const initialTranscript = initialSession?.transcript ?? [];
  const hasPendingUser = initialTranscript.length > 0 && initialTranscript[initialTranscript.length - 1].role === "user";
  const startedRef = useRef(initialTranscript.length > 0 && !hasPendingUser);

  useEffect(() => {
    const container = messagesRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
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
      try {
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
            setRetryPayload(null);
          },
          onSummary: (s) => setSummary(s),
          onError: (message) => {
            setError(message);
            setRetryPayload(payload);
            if (typeof payload.message === "string") setInput(payload.message);
          },
        },
      );
      } catch {
        setError(ru.errors.network);
        setRetryPayload(payload);
        if (typeof payload.message === "string") setInput(payload.message);
      } finally {
        setBusy(false);
      }
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
    if (!trimmed || busy || voiceBusy) return;
    if (trimmed.length > 2000) { setError("Ответ длиннее 2000 символов. Сократите текст перед отправкой."); return; }
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

  const retryTurn = async () => {
    if (busy || !retryPayload) return;
    setBusy(true);
    try {
      const response = await fetch("/api/interview/session", { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось восстановить состояние интервью.");
      const data = await response.json() as { session: (InterviewSessionState & { sessionId?: string }) | null };
      const saved = data.session;
      const pendingText = typeof retryPayload.message === "string" ? retryPayload.message : undefined;
      if (saved) {
        const id = saved.sessionId ?? saved.id;
        const transcript = saved.transcript ?? [];
        setSession({ ...saved, id, topicsTotal: saved.agenda?.length ?? saved.topicsTotal });
        setMessages(transcript);
        setSummary(saved.summary);
        const last = transcript.at(-1);
        const lastUser = [...transcript].reverse().find((item) => item.role === "user");
        if (pendingText && lastUser?.text === pendingText && last?.role !== "user") {
          setInput(""); setError(null); setRetryPayload(null); setBusy(false); return;
        }
        if (last?.role === "user") {
          setInput(""); setBusy(false); await runStream({ sessionId: id }); return;
        }
        if (pendingText) {
          setMessages([...transcript, { role: "user", text: pendingText, ts: new Date().toISOString() }]);
          setInput(""); setBusy(false); await runStream({ sessionId: id, message: pendingText }); return;
        }
        if (transcript.length > 0) { setError(null); setRetryPayload(null); setBusy(false); return; }
        setBusy(false); await runStream({ sessionId: id }); return;
      }
      setBusy(false);
      await runStream(retryPayload);
    } catch {
      setError("Не удалось восстановить состояние интервью. Попробуйте снова.");
      setBusy(false);
    }
  };

  const confirmSummary = async () => {
    if (!session || busy || voiceBusy || confirming) return;
    setConfirming(true);
    setError(null);
    try {
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
    } catch {
      setError(ru.errors.network);
      setConfirming(false);
    }
  };

  const topicNumber = session?.topicNumber ?? 1;
  const topicsTotal = session?.topicsTotal ?? 1;
  const currentTopic = session?.currentTopic ?? "";
  const awaitingConfirmation = summary !== null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] min-h-[320px] max-w-4xl flex-col gap-3">
      {showGuide && messages.some((message) => message.role === "assistant") && <InterviewGuide onFinish={() => setShowGuide(false)} />}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2" data-interview-guide="progress">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="flex items-center gap-2 text-base font-medium text-ink sm:text-lg">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-lime" />
            Беседа о вашей работе
          </h1>
          {!awaitingConfirmation && currentTopic && <p className="mt-1 break-words pl-4 text-sm text-muted">{currentTopic}</p>}
          {busy && <p role="status" className="mt-1 pl-4 text-xs text-muted">{ru.interview.typing}</p>}
        </div>
        {!awaitingConfirmation && <span className="pt-1 text-xs text-muted">{ru.interview.topicProgress} {topicNumber} {ru.interview.topicOf} {topicsTotal}</span>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={messagesRef} className="thin-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-4 sm:px-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                data-interview-guide={i === 0 && m.role === "assistant" ? "dialog" : undefined}
                className={cn(
                  "max-w-[90%] break-words rounded-[22px] px-5 py-4 text-base leading-relaxed whitespace-pre-wrap sm:max-w-[85%]",
                  showGuide && i === 0 && "max-h-[30dvh] overflow-y-auto",
                  m.role === "user"
                    ? "bg-ink text-white rounded-br-sm"
                    : "border border-line-soft bg-cream text-ink rounded-bl-sm",
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-cream px-4 py-2.5 text-sm text-muted">…</div>
            </div>
          )}

          {summary && (
            <SummaryCard
              summary={summary}
              confirming={confirming}
              disabled={busy || voiceBusy}
              onConfirm={() => void confirmSummary()}
            />
          )}

          {error && (
            <div className="rounded-[14px] bg-danger-soft p-3 text-base text-danger" role="alert">
              {error}
              {retryPayload && <Button type="button" variant="outline" size="sm" className="mt-2 block" disabled={busy} onClick={() => void retryTurn()}>Попробовать снова</Button>}
            </div>
          )}
        </div>

      <form
        data-interview-guide="answer"
        className="relative mx-auto mb-2 flex w-full max-w-2xl shrink-0 items-end gap-2 rounded-[28px] border border-line-warm bg-cream p-2 shadow-sm focus-within:ring-2 focus-within:ring-lime"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
      >
        <textarea
          aria-label="Ваш ответ интервьюеру"
          ref={taRef}
          rows={1}
          value={input}
          placeholder={ru.interview.inputPlaceholder}
          disabled={busy || retryPayload !== null || (showGuide && messages.length === 0)}
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
          className="thin-scroll max-h-[30dvh] min-h-10 min-w-0 flex-1 resize-none bg-transparent px-4 py-2 text-base outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex shrink-0 items-center">
          <VoiceInput disabled={busy || retryPayload !== null || (showGuide && messages.length === 0)} hasText={Boolean(input.trim())} textTooLong={input.trim().length > 2000} onBusyChange={setVoiceBusy} onText={(text) => { setInput((previous) => previous.trim() ? `${previous.trimEnd()} ${text}` : text); requestAnimationFrame(resizeTextarea); }} />
          {input.trim().length > 2000 && <span role="alert" className="absolute bottom-full left-4 mb-2 rounded-lg bg-danger-soft px-2 py-1 text-xs text-danger">Сократите ответ до 2000 символов.</span>}
        </div>
      </form>
      </div>
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
    <div className="space-y-4 rounded-[22px] border border-line-warm bg-paper p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-accent">
          РЕЗЮМЕ · {ru.interview.summaryTitle}
        </div>
        {employeeLine && <div className="text-xs text-muted">{employeeLine}</div>}
      </div>

      {summary.processes.length === 0 && (
        <p className="text-sm text-muted">{ru.interview.noProcesses}</p>
      )}

      {summary.processes.map((p, i) => (
        <div key={i} className="space-y-2 rounded-[14px] border border-line-soft bg-cream p-4 text-sm">
          <div className="font-medium">{p.name}</div>
          {p.detail_status && <p className="text-xs text-muted">{p.detail_status === "discussed" ? "Обсуждена подробнее" : "Упомянута, детали не разобраны"}</p>}
          {p.steps.length > 0 && (
            <div>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.interview.processSteps}:</span>
              <ol className="ml-4 list-decimal text-ink">
                {p.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          <div className="grid gap-x-4 gap-y-1 text-ink sm:grid-cols-2">
            {p.actors.length > 0 && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.interview.processActors}: </span>
                {p.actors.join(", ")}
              </div>
            )}
            {p.systems.length > 0 && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.interview.processSystems}: </span>
                {p.systems.join(", ")}
              </div>
            )}
            {p.volume && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.interview.processVolume}: </span>
                {p.volume}
              </div>
            )}
            {p.frequency && <div><span className="font-mono text-[10px] uppercase tracking-wide text-muted">Частота: </span>{p.frequency}</div>}
            {p.duration && <div><span className="font-mono text-[10px] uppercase tracking-wide text-muted">Время выполнения: </span>{p.duration}</div>}
            {p.total_time && <div><span className="font-mono text-[10px] uppercase tracking-wide text-muted">Общее время: </span>{p.total_time}</div>}
            {p.pain && (
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{ru.interview.processPain}: </span>
                {p.pain}
              </div>
            )}
          </div>
          {p.improvements && p.improvements.length > 0 && <p><span className="font-medium">Пожелания: </span>{p.improvements.join(", ")}</p>}
        </div>
      ))}

      {summary.open_questions.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Что осталось невыясненным</p>
          <ul className="ml-4 list-disc text-muted">
            {summary.open_questions.map((question, index) => <li key={index}>{question}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">{ru.interview.confirmHint}</p>
        <Button variant="lime" onClick={onConfirm} disabled={confirming || disabled} className="shrink-0">
          <Check className="h-4 w-4" />{confirming ? ru.common.loading : ru.interview.confirmButton}
        </Button>
      </div>
    </div>
  );
}

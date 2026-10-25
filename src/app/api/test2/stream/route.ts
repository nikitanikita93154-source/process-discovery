import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import {
  INTERVIEW_LIMIT_MS,
  coverageSchema,
  streamRequestSchema,
  transcriptItemSchema,
  interviewSummarySchema,
  factSchema,
  type Coverage,
  type Fact,
  type InterviewSummary,
  type TranscriptItem,
} from "@/lib/schemas/test2";
import { test1AnswersSchema, type Test1Answers } from "@/lib/schemas/test1";
import { buildAgenda,
         TOPIC_SUMMARY
} from "@/lib/agent/agenda";
import {
  agentTurn,
  applyArtifact,
  applySkip,
  currentTopicIndex,
  summarize,
  timeLimitExceeded,
  START_MARKER,
  type InterviewState,
} from "@/lib/agent/interview";
import { completeInterview } from "@/lib/agent/source";

export const maxDuration = 120;

function loadState(row: {
  id: string;
  userId: string;
  status: string;
  startedAt: Date;
  agenda: unknown;
  coverage: unknown;
  transcript: unknown;
  facts: unknown;
  summary: unknown;
}, employeeName: string, t1: Test1Answers | null): InterviewState {
  return {
    sessionId: row.id,
    userId: row.userId,
    employeeName,
    status: row.status,
    startedAt: row.startedAt,
    agenda: (row.agenda as string[]) ?? [],
    coverage: coverageSchema.parse(row.coverage ?? { topics: {}, followUps: 0 }),
    transcript: transcriptItemSchema.array().parse(row.transcript ?? []),
    facts: factSchema.array().parse(row.facts ?? []),
    summary: row.summary ? (interviewSummarySchema.parse(row.summary) as InterviewSummary) : null,
    t1,
  };
}

async function persist(state: InterviewState, status?: string) {
  await db.interviewSession.update({
    where: { id: state.sessionId },
    data: {
      status: status ?? state.status,
      agenda: state.agenda,
      coverage: state.coverage,
      transcript: state.transcript,
      facts: state.facts,
      summary: state.summary ?? Prisma.DbNull,
    },
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireApiUser();
    const body = await parseBody(req, streamRequestSchema);

    // --- Загрузка или создание сессии ---
    let row = body.sessionId
      ? await db.interviewSession.findFirst({
          where: { id: body.sessionId, userId: user.id },
        })
      : await db.interviewSession.findFirst({
          where: { userId: user.id, status: { in: ["in_progress", "awaiting_confirmation"] } },
          orderBy: { startedAt: "desc" },
        });

    if (row && row.status === "completed") throw new ApiError(400, "Интервью уже завершено");

    if (!row) {
      // Новая сессия: Тест 1 обязателен
      const t1row = await db.test1Session.findUnique({ where: { userId: user.id } });
      if (t1row?.status !== "completed" || !t1row.answers) {
        throw new ApiError(403, "Сначала пройдите Тест 1 — интервью строится на его ответах");
      }
      const t1 = test1AnswersSchema.parse(t1row.answers);

      const openFollowUps = await db.followUpQuestion.findMany({
        where: { project: { orgId: user.orgId }, status: "open" },
        take: 5,
        orderBy: { createdAt: "asc" },
      });
      const agenda = buildAgenda(t1, openFollowUps.map((f) => f.text));
      const project = await db.project.findFirst({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" } });

      row = await db.interviewSession.create({
        data: {
          userId: user.id,
          projectId: project?.id,
          test1Id: t1row.id,
          status: "in_progress",
          agenda: agenda.topics,
          coverage: { topics: Object.fromEntries(agenda.topics.map((t) => [t, "open"])), followUps: 0 },
          transcript: [],
          facts: [],
        },
      });
    }

    const t1row = await db.test1Session.findUnique({ where: { userId: user.id } });
    const parsed = t1row?.answers ? test1AnswersSchema.safeParse(t1row.answers) : null;
    const t1 = parsed?.success ? parsed.data : null;
    const state0 = loadState(row, user.name ?? "Сотрудник", t1);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        const sendSession = (s: InterviewState) => {
          const idx = currentTopicIndex(s);
          send("session", {
            sessionId: s.sessionId,
            status: s.status,
            agenda: s.agenda,
            coverage: s.coverage,
            currentTopic: idx >= 0 ? s.agenda[idx] : TOPIC_SUMMARY,
            topicNumber: Math.min(idx + 1, s.agenda.length),
            topicsTotal: s.agenda.length,
            elapsedMs: Date.now() - new Date(s.startedAt).getTime(),
            limitMs: INTERVIEW_LIMIT_MS,
          });
        };

        try {
          sendSession(state0);

          let state = state0;

          // --- Команда STOP: резюме + завершение с сохранением ---
          if (body.command === "STOP") {
            const { turn, state: s } = await summarize(state);
            state = s;
            await persist(state);
            sendSession(state);
            send("turn", turn);
            send("summary", state.summary);
            const { projectId } = await completeInterview(state);
            send("session", {
              sessionId: state.sessionId,
              status: "completed",
              projectId,
              agenda: state.agenda,
              coverage: state.coverage,
            });
            send("done", { completed: true, projectId });
            controller.close();
            return;
          }

          // --- 15-минутный лимит: форсируем резюме ---
          if (timeLimitExceeded(state, INTERVIEW_LIMIT_MS) && state.status === "in_progress") {
            const { turn, state: s } = await summarize(state);
            state = s;
            await persist(state);
            sendSession(state);
            send("turn", turn);
            send("summary", state.summary);
            send("done", { timeLimit: true });
            controller.close();
            return;
          }

          // --- Обычный ход: сообщение / SKIP / artifact / [START] ---
          let userMessage = START_MARKER;
          if (body.command === "SKIP") {
            state = applySkip(state);
            userMessage = "Сотрудник пропустил тему командой SKIP. Перейди к следующей открытой теме повестки.";
          } else if (body.artifact) {
            const res = applyArtifact(state, body.artifact);
            state = res.state;
            userMessage = `Сотрудник решил по предложенному артефакту: ${res.userMessage}. Учитывай это и продолжай интервью по текущей теме.`;
          } else if (body.message) {
            userMessage = body.message;
          }

          // Если сессия ждёт подтверждения — только summarize-повтор
          if (state.status === "awaiting_confirmation") {
            send("turn", {
              message: "Резюме готово. Подтвердите или исправьте его на экране подтверждения.",
              extracted_facts: [],
              quick_replies: [],
              next_action: "confirm",
            });
            send("summary", state.summary);
            send("done", {});
            controller.close();
            return;
          }

          // Транскрипт с сообщением сотрудника сохраняем до вызова LLM (устойчивость к сбоям)
          if (body.message || body.command === "SKIP" || body.artifact) {
            await persist(state);
          }

          const { turn, state: next } = await agentTurn(state, userMessage);
          state = next;
          await persist(state); // после каждого хода — в БД

          sendSession(state);
          send("turn", turn);
          if (state.status === "awaiting_confirmation" && state.summary) {
            send("summary", state.summary);
          }
          send("done", {});
          controller.close();
        } catch (e) {
          // Fallback: сбой LLM/JSON → вежливое сообщение + сохранение сессии
          console.error("[test2/stream]", e);
          const message =
            e instanceof Error && e.message.includes("LLM")
              ? "Извините, возникла техническая заминка на нашей стороне. Сессия сохранена — попробуйте отправить сообщение ещё раз."
              : "Извините, произошла ошибка. Сессия сохранена, ваши ответы не потеряны. Попробуйте продолжить.";
          send("error", { message });
          send("done", { error: true });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });
}

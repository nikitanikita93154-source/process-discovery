import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import { LLMError } from "@/lib/llm";
import {
  ACTIVE_SESSION_STATUSES,
  SESSION_STATUS,
  streamRequestSchema,
  type AgentTurn,
} from "@/lib/schemas/interview";
import { buildAgenda } from "@/lib/agent/agenda";
import { loadInterviewState, sessionSnapshot } from "@/lib/agent/session";
import {
  agentTurn,
  appendUserMessage,
  applySummaryCorrection,
  hasPendingUserMessage,
  summarize,
  type InterviewState,
} from "@/lib/agent/interview";

export const maxDuration = 120;

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

    const completed = await db.interviewSession.findFirst({ where: { userId: user.id, status: SESSION_STATUS.COMPLETED }, select: { id: true } });
    if (completed) throw new ApiError(400, "Интервью уже завершено");

    // --- Загрузка или создание сессии ---
    let row = body.sessionId
      ? await db.interviewSession.findFirst({
          where: { id: body.sessionId, userId: user.id },
        })
      : await db.interviewSession.findFirst({
          where: { userId: user.id, status: { in: [...ACTIVE_SESSION_STATUSES] } },
          orderBy: { startedAt: "desc" },
        });

    if (row && row.status === SESSION_STATUS.COMPLETED) throw new ApiError(400, "Интервью уже завершено");
    if (body.sessionId && !row) throw new ApiError(404, "Сессия не найдена");
    if (row && !ACTIVE_SESSION_STATUSES.includes(row.status as (typeof ACTIVE_SESSION_STATUSES)[number])) throw new ApiError(400, "Сессия недоступна");

    if (!row) {
      const openFollowUps = await db.followUpQuestion.findMany({
        where: { project: { orgId: user.orgId, participants: { some: { userId: user.id } } }, status: "open" },
        take: 5,
        orderBy: { createdAt: "asc" },
      });
      const agenda = buildAgenda(openFollowUps.map((f) => f.text));

      // ВАЖНО: projectId не выставляем — null означает «финализация ещё не
      // проходила» (см. completeInterview), а не «последний проект организации»
      row = await db.interviewSession.create({
        data: {
          userId: user.id,
          status: SESSION_STATUS.IN_PROGRESS,
          agenda: agenda.topics,
          coverage: { topics: Object.fromEntries(agenda.topics.map((t) => [t, "open"])), followUps: 0 },
          transcript: [],
          facts: [],
        },
      });
    }

    const state0 = loadInterviewState(row, user.name ?? "Сотрудник");

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        const sendSession = (s: InterviewState) => send("session", sessionSnapshot(s));

        // Общая концовка хода: прогресс + сообщение агента (+резюме) + done
        const emitTurn = (s: InterviewState, turn: AgentTurn) => {
          sendSession(s);
          send("turn", turn);
          if (s.summary && s.status === SESSION_STATUS.AWAITING_CONFIRMATION) {
            send("summary", s.summary);
          }
          send("done", {});
        };

        // Форсированное резюме (STOP / лимит времени): summarize → persist → эмуляция хода
        const finishWithSummary = async (s: InterviewState) => {
          const { turn, state: next } = await summarize(s);
          await persist(next);
          emitTurn(next, turn);
          controller.close();
        };

        try {
          sendSession(state0);

          let state = state0;

          // --- Досрочное завершение (STOP) или временной лимит: резюме ---
          if (
            state.status === SESSION_STATUS.IN_PROGRESS &&
            body.command === "STOP"
          ) {
            if (body.message) {
              state = appendUserMessage(state, body.message);
              await persist(state);
            }
            await finishWithSummary(state);
            return;
          }

          // --- Резюме ждёт подтверждения: правка замечанием или повторная отправка ---
          if (state.status === SESSION_STATUS.AWAITING_CONFIRMATION) {
            if (body.message && state.summary) {
              // Замечание попадает в транскрипт ровно один раз и сохраняется до вызова LLM
              state = appendUserMessage(state, body.message);
              await persist(state);
              const { turn, state: s } = await applySummaryCorrection(state, body.message);
              state = s;
              await persist(state);
              emitTurn(state, turn);
            } else {
              send("summary", state.summary);
              send("done", {});
            }
            controller.close();
            return;
          }

          // --- Обычный ход диалога ---
          if (body.message) {
            // Сообщение сотрудника пишем в транскрипт ровно один раз
            // и сохраняем до вызова LLM (устойчивость к сбоям; ретрай не дублирует)
            state = appendUserMessage(state, body.message);
            await persist(state);
          } else if (state.transcript.length > 0 && !hasPendingUserMessage(state)) {
            // Пустое сообщение при живой сессии без неотвеченного хода — нечего делать
            send("done", {});
            controller.close();
            return;
          }
          // Пустое сообщение при пустом транскрипте → приветствие;
          // при «висящем» неотвеченном сообщении → восстановление прерванного хода

          const { turn, state: next } = await agentTurn(state);
          state = next;
          await persist(state); // после каждого хода — в БД

          emitTurn(state, turn);
          controller.close();
        } catch (e) {
          // Fallback: сбой LLM/JSON → вежливое сообщение + сохранение сессии
          console.error("[interview/stream]", e);
          const message =
            e instanceof LLMError
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

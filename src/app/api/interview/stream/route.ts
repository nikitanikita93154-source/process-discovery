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
  type InterviewState,
} from "@/lib/agent/interview";

export const maxDuration = 120;

const INTERVIEW_GREETING = "Здравствуйте! Это чат для интервью о вашей работе. Я ИИ-агент: буду задавать вопросы, чтобы понять, как устроены ваши задачи, где возникают сложности и что можно улучшить. Пожалуйста, отвечайте подробно: описывайте шаги, приводите примеры и рассказывайте, что отнимает больше всего времени. Чем подробнее ответы, тем точнее мы сможем определить слабые места в рабочих процессах.";
const globalLocks = globalThis as typeof globalThis & { interviewUserLocks?: Set<string> };
const userLocks = globalLocks.interviewUserLocks ??= new Set<string>();

async function persist(state: InterviewState, expectedTranscript: InterviewState["transcript"], status?: string) {
  const result = await db.interviewSession.updateMany({
    where: { id: state.sessionId, transcript: { equals: expectedTranscript } },
    data: {
      status: status ?? state.status,
      agenda: state.agenda,
      coverage: state.coverage,
      transcript: state.transcript,
      facts: state.facts,
      summary: state.summary ?? Prisma.DbNull,
    },
  });
  if (result.count !== 1) throw new ApiError(409, "Состояние интервью изменилось. Повторите запрос.");
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireApiUser();
    const body = await parseBody(req, streamRequestSchema);
    if (userLocks.has(user.id)) throw new ApiError(409, "Предыдущий ответ ещё обрабатывается. Попробуйте снова через несколько секунд.");
    userLocks.add(user.id);
    try {

    const completed = await db.interviewSession.findFirst({ where: { userId: user.id, status: SESSION_STATUS.COMPLETED, projectId: { not: null } }, select: { id: true } });
    if (completed) throw new ApiError(400, "Интервью уже завершено");

    // --- Загрузка или создание сессии ---
    let row = body.sessionId
      ? await db.interviewSession.findFirst({
          where: { id: body.sessionId, userId: user.id },
        })
      : await db.interviewSession.findFirst({
          where: { userId: user.id, OR: [{ status: { in: [...ACTIVE_SESSION_STATUSES] } }, { status: SESSION_STATUS.COMPLETED, projectId: null }] },
          orderBy: { startedAt: "desc" },
        });

    if (row && row.status === SESSION_STATUS.COMPLETED && row.projectId) throw new ApiError(400, "Интервью уже завершено");
    if (body.sessionId && !row) throw new ApiError(404, "Сессия не найдена");
    if (row && !ACTIVE_SESSION_STATUSES.includes(row.status as (typeof ACTIVE_SESSION_STATUSES)[number]) && !(row.status === SESSION_STATUS.COMPLETED && !row.projectId && row.summary)) throw new ApiError(400, "Сессия недоступна");

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
    if (state0.status === SESSION_STATUS.COMPLETED && !row.projectId && state0.summary) state0.status = SESSION_STATUS.AWAITING_CONFIRMATION;

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

        try {
          sendSession(state0);

          let state = state0;
          let persistedTranscript = state0.transcript;

          // --- Резюме ждёт подтверждения: правка замечанием или повторная отправка ---
          if (state.status === SESSION_STATUS.AWAITING_CONFIRMATION) {
            if (state.summary && (body.message || hasPendingUserMessage(state))) {
              // Замечание попадает в транскрипт ровно один раз и сохраняется до вызова LLM
              if (body.message) {
                state = appendUserMessage(state, body.message);
                await persist(state, persistedTranscript);
                persistedTranscript = state.transcript;
              }
              const correction = state.transcript.at(-1)!.text;
              const { turn, state: s } = await applySummaryCorrection(state, correction);
              state = s;
              await persist(state, persistedTranscript);
              persistedTranscript = state.transcript;
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
            await persist(state, persistedTranscript);
            persistedTranscript = state.transcript;
          } else if (state.transcript.length > 0 && !hasPendingUserMessage(state)) {
            // Пустое сообщение при живой сессии без неотвеченного хода — нечего делать
            send("done", {});
            controller.close();
            return;
          }
          // Пустое сообщение при пустом транскрипте → приветствие;
          // при «висящем» неотвеченном сообщении → восстановление прерванного хода

          const { turn, state: next } = await agentTurn(state);
          if (state.transcript.length === 0) {
            turn.message = `${INTERVIEW_GREETING}\n\n${turn.message}`;
            next.transcript[next.transcript.length - 1].text = turn.message;
          }
          state = next;
          await persist(state, persistedTranscript); // сохраняем, только если сессию не изменил другой запрос

          emitTurn(state, turn);
          controller.close();
        } catch (e) {
          // Fallback: сбой LLM/JSON → вежливое сообщение + сохранение сессии
          console.error("[interview/stream]", e instanceof LLMError ? "Ошибка провайдера или схемы" : "Ошибка обработки хода");
          const message =
            e instanceof LLMError
              ? "Возникла техническая заминка. Проверьте последний ответ и попробуйте отправить его ещё раз."
              : "Произошла ошибка. Проверьте последний ответ и попробуйте отправить его ещё раз.";
          send("error", { message });
          send("done", { error: true });
          controller.close();
        } finally {
          userLocks.delete(user.id);
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
    } catch (error) {
      userLocks.delete(user.id);
      throw error;
    }
  });
}

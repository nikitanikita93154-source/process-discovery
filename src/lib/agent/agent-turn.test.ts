import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ chat: vi.fn() }));

import { chat } from "@/lib/llm";
import { agentTurn, appendUserMessage, type InterviewState } from "@/lib/agent/interview";
import { TOPIC_GUT, TOPIC_HANDOFFS, TOPIC_SUMMARY, buildAgenda, mainQuestionForTopic } from "@/lib/agent/agenda";
import { SESSION_STATUS, type AgentTurn, type TranscriptItem } from "@/lib/schemas/interview";

const mockChat = vi.mocked(chat);

/** Состояние «все темы закрыты, кроме одной» — типичный сценарий зацикливания. */
function stateWithOneOpenTopic(lastAssistantText?: string): InterviewState {
  const agenda = buildAgenda([]);
  const topics: Record<string, "open" | "covered" | "skipped"> = {};
  for (const t of agenda.topics) topics[t] = t === TOPIC_GUT ? "open" : t === TOPIC_SUMMARY ? "open" : "covered";
  const transcript: TranscriptItem[] = [];
  if (lastAssistantText) {
    transcript.push({ role: "assistant", text: lastAssistantText, ts: new Date().toISOString(), topic: TOPIC_GUT });
  }
  transcript.push({ role: "user", text: "ответ по теме", ts: new Date().toISOString(), topic: TOPIC_GUT });
  return {
    sessionId: "s1",
    userId: "u1",
    employeeName: "Вера",
    status: SESSION_STATUS.IN_PROGRESS,
    startedAt: new Date(),
    agenda: agenda.topics,
    coverage: { topics, followUps: 0, vetoCount: 0 },
    transcript,
    facts: [],
    summary: null,
  };
}

/** Две открытые темы (Передачи + на глазок) — для проверки переключения при повторе. */
function stateWithTwoOpenTopics(lastAssistantText: string): InterviewState {
  const agenda = buildAgenda([]);
  const topics: Record<string, "open" | "covered" | "skipped"> = {};
  for (const t of agenda.topics) {
    topics[t] = t === TOPIC_GUT || t === TOPIC_HANDOFFS || t === TOPIC_SUMMARY ? "open" : "covered";
  }
  return {
    sessionId: "s2",
    userId: "u1",
    employeeName: "Вера",
    status: SESSION_STATUS.IN_PROGRESS,
    startedAt: new Date(),
    agenda: agenda.topics,
    coverage: { topics, followUps: 0, vetoCount: 0 },
    transcript: [
      { role: "assistant", text: lastAssistantText, ts: new Date().toISOString(), topic: TOPIC_HANDOFFS },
      { role: "user", text: "ответ", ts: new Date().toISOString(), topic: TOPIC_HANDOFFS },
    ],
    facts: [],
    summary: null,
  };
}

const summarizeTurn = {
  message: "Завершим интервью",
  extracted_facts: [],
  next_action: "summarize",
} as AgentTurn;

const summaryPayload = {
  processes: [{ name: "Процесс", steps: [], actors: [], systems: [], volume: "", pain: "" }],
  open_questions: [],
};

beforeEach(() => {
  mockChat.mockReset();
});

describe("agentTurn: guard преждевременного summarize", () => {
  it("модель закрыла последнюю тему своим coverage_update — резюме сразу, без повторного вопроса", async () => {
    mockChat
      .mockResolvedValueOnce({ ...summarizeTurn, coverage_update: { topic: TOPIC_GUT, status: "covered" } } as never)
      .mockResolvedValueOnce(summaryPayload as never);

    const { state } = await agentTurn(stateWithOneOpenTopic());

    expect(state.status).toBe(SESSION_STATUS.AWAITING_CONFIRMATION);
    expect(state.coverage.topics[TOPIC_GUT]).toBe("covered");
    expect(state.summary?.processes[0]?.name).toBe("Процесс");
  });

  it("первое вето: штатный вопрос открытой темы, тема остаётся открытой, vetoCount=1", async () => {
    mockChat.mockResolvedValueOnce(summarizeTurn as never);

    const { turn, state } = await agentTurn(stateWithOneOpenTopic());

    expect(turn.next_action).toBe("ask");
    expect(turn.message).toBe(mainQuestionForTopic(TOPIC_GUT));
    expect(state.coverage.topics[TOPIC_GUT]).toBe("open");
    expect(state.coverage.vetoCount).toBe(1);
    expect(mockChat).toHaveBeenCalledTimes(1); // второго вызова (резюме) не было
  });

  it(`второе вето подряд — форс-закрытие тем и резюме (предохранитель от цикла)`, async () => {
    // Ход 1: модель summarize без coverage_update → вето, штатный вопрос
    mockChat.mockResolvedValueOnce(summarizeTurn as never);
    const first = await agentTurn(stateWithOneOpenTopic());
    expect(first.state.coverage.vetoCount).toBe(1);

    // Пользователь отвечает, модель снова настаивает на summarize
    mockChat.mockResolvedValueOnce(summarizeTurn as never).mockResolvedValueOnce(summaryPayload as never);
    const second = await agentTurn(appendUserMessage(first.state, "ещё ответ"));

    expect(second.state.status).toBe(SESSION_STATUS.AWAITING_CONFIRMATION);
    expect(second.state.coverage.topics[TOPIC_GUT]).toBe("skipped");
    expect(second.state.coverage.vetoCount).toBe(0);
    expect(second.state.summary).not.toBeNull();
  });

  it("чередование summarize/ask без прогресса НЕ сбрасывает счётчик — цикл невозможен", async () => {
    // Ход 1: summarize → вето 1, штатный вопрос
    mockChat.mockResolvedValueOnce(summarizeTurn as never);
    const t1 = await agentTurn(stateWithOneOpenTopic());
    expect(t1.state.coverage.vetoCount).toBe(1);

    // Ход 2: модель сама переформулирует вопрос (ask, без новых фактов и coverage)
    mockChat.mockResolvedValueOnce({ message: "И всё же — какие решения вы принимаете?", extracted_facts: [], next_action: "ask" } as never);
    const t2 = await agentTurn(appendUserMessage(t1.state, "ответ"));
    expect(t2.state.coverage.vetoCount).toBe(1); // счётчик сохранился

    // Ход 3: снова summarize → второе вето → форс-резюме
    mockChat.mockResolvedValueOnce(summarizeTurn as never).mockResolvedValueOnce(summaryPayload as never);
    const t3 = await agentTurn(appendUserMessage(t2.state, "ответ"));
    expect(t3.state.status).toBe(SESSION_STATUS.AWAITING_CONFIRMATION);
  });

  it("счётчик вето сбрасывается при прогрессе — новая закрываемая тема", async () => {
    mockChat
      .mockResolvedValueOnce(summarizeTurn as never) // вето → ask
      .mockResolvedValueOnce({
        message: "Переходим дальше.",
        extracted_facts: [],
        coverage_update: { topic: TOPIC_GUT, status: "covered" },
        next_action: "ask",
      } as never);

    const first = await agentTurn(stateWithOneOpenTopic());
    expect(first.state.coverage.vetoCount).toBe(1);

    const second = await agentTurn(appendUserMessage(first.state, "ответ"));
    expect(second.state.coverage.vetoCount).toBe(0); // тема закрыта — прогресс
  });

  it("дословный повтор вопроса сохраняет тему и предлагает конкретный пример", async () => {
    const s = stateWithTwoOpenTopics("Сколько писем?");
    mockChat.mockResolvedValueOnce({
      message: "сколько   писем?", // нормализация: регистр и пробелы
      extracted_facts: [],
      next_action: "ask",
    } as never);

    const { turn, state } = await agentTurn(s);
    expect(state.coverage.topics[TOPIC_HANDOFFS]).toBe("open");
    expect(turn.message).toContain("конкретном примере");
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it("дословный повтор на последней теме не завершает интервью", async () => {
    const s = stateWithOneOpenTopic("Сколько писем?");
    mockChat.mockResolvedValueOnce({ message: "Сколько писем?", extracted_facts: [], next_action: "ask" } as never)
      .mockResolvedValueOnce(summaryPayload as never);

    const { state } = await agentTurn(s);
    expect(state.status).toBe(SESSION_STATUS.IN_PROGRESS);
    expect(state.coverage.topics[TOPIC_GUT]).toBe("open");
  });
});

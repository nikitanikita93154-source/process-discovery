import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({ chat: vi.fn() }));

import { chat } from "@/lib/llm";
import { loadInterviewState } from "./session";
import { agentTurn, appendUserMessage, factsFromConfirmedSummary, type InterviewState } from "@/lib/agent/interview";
import { TOPIC_GUT, TOPIC_HANDOFFS, TOPIC_ROLE, TOPIC_SUMMARY, TOPIC_TASKS, buildAgenda, deepDiveTopic, mainQuestionForTopic } from "@/lib/agent/agenda";
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

describe("глубина интервью", () => {
  it("засчитывает ответ о начале задачи, даже если модель пропустила dive_updates", async () => {
    const s = stateWithOneOpenTopic();
    const topic = deepDiveTopic("Поиск трендов");
    s.agenda.unshift(topic);
    s.coverage.topics[topic] = "open";
    s.coverage.dives = { [topic]: { actions: "known", result: "known" } };
    s.coverage.questions = [{ topic, detail: "Поиск трендов/input", status: "asked" }];
    mockChat.mockResolvedValueOnce({ message: "Чего обычно ждёте?", next_action: "ask", previous_answer: "answered",
      extracted_facts: [], coverage_update: { topic, status: "covered" } } as never);
    const result = await agentTurn(s);
    expect(result.state.coverage.dives?.[topic]?.input).toBe("known");
    expect(result.turn.message).not.toContain("начинается");
  });

  it("восстанавливает действия и результат по словам сотрудника, если модель опустила процесс в резюме", async () => {
    const s = stateWithOneOpenTopic();
    s.transcript[0].text = "Записываю примеры в таблицу. Готово, когда редактор принял подборку.";
    s.facts = [{ type: "task", name: "Подборка", source: "msg#1" }];
    s.coverage.observations = [
      { task: "Подборка", field: "actions", status: "known", quote: "Записываю примеры в таблицу", source: "msg#1" },
      { task: "Подборка", field: "result", status: "known", quote: "Готово, когда редактор принял подборку", source: "msg#1" },
    ];
    mockChat.mockResolvedValueOnce({ processes: [], open_questions: [] } as never);
    const result = await agentTurn(appendUserMessage(s, "Хочу закончить"));
    expect(result.state.summary?.processes[0]?.steps).toEqual(s.coverage.observations.map(o => o.quote));
    expect(result.state.summary?.open_questions.length).toBeGreaterThan(0);
  });

  it("уточняет связь отдельно от фактов и после перезагрузки принимает неизвестное значение", async () => {
    const s = stateWithTwoOpenTopics("Что делаете во время ожидания?");
    const hypothesis = { type: "step", name: "Исправляю ошибки во время ожидания", source: "msg#1" };
    const question = "Когда именно приходится исправлять ошибки?";
    mockChat.mockResolvedValueOnce({ message: "Перейдём дальше?", next_action: "ask",
      coverage_update: { topic: TOPIC_HANDOFFS, status: "covered" }, extracted_facts: [hypothesis],
      clarification: { kind: "relation", subject: "Исправление ошибок", detail: "время исправления", question, hypothesis },
    } as never);
    const first = await agentTurn(s);
    expect(first.turn.message).toBe(question);
    expect(first.state.facts).toEqual([]);
    expect(first.state.coverage.topics[TOPIC_HANDOFFS]).toBe("open");
    const restored = loadInterviewState({ ...first.state, id: s.sessionId }, s.employeeName);
    mockChat.mockResolvedValueOnce({ message: "Чего обычно ждёте?", next_action: "ask", extracted_facts: [hypothesis] } as never);
    const next = await agentTurn(appendUserMessage(restored, "Не знаю"));
    expect(next.state.coverage.clarifications?.[0]).toMatchObject({ status: "unknown", source: "msg#1", responseSource: "msg#2" });
    expect(next.state.facts).toEqual([]);
  });

  it("уточняет ошибку в текущей теме до перехода по повестке", async () => {
    const s = stateWithTwoOpenTopics("Что обычно занимает время?");
    s.transcript[1].text = "При ручном переносе в CRM часто ошибаюсь с датой.";
    mockChat.mockResolvedValueOnce({ message: "Следующая тема?", next_action: "ask", extracted_facts: [],
      coverage_update: { topic: TOPIC_HANDOFFS, status: "covered" } } as never);
    const next = await agentTurn(s);
    expect(next.turn.message).toContain("обнаружили ошибку");
    expect(next.state.coverage.topics[TOPIC_HANDOFFS]).toBe("open");
  });

  it("сохраняет расхождение один раз и включает неизвестное в резюме", async () => {
    const s = stateWithOneOpenTopic();
    const task = { type: "task", name: "Акты", volume: "20 актов в день", duration: "5 минут", total_time: "около часа в день", source: "msg#1" };
    mockChat.mockResolvedValueOnce({ message: "Дальше?", next_action: "ask", extracted_facts: [task] } as never);
    const first = await agentTurn(s);
    expect(first.turn.message).toContain("части объёма");
    mockChat.mockResolvedValueOnce({ message: "Что ещё?", next_action: "ask", extracted_facts: [] } as never);
    const second = await agentTurn(appendUserMessage(first.state, "Не помню"));
    expect(second.turn.message).toBe("Что ещё?");
    mockChat.mockResolvedValueOnce({ processes: [], open_questions: [] } as never);
    const end = await agentTurn(appendUserMessage(second.state, "Хочу закончить"));
    expect(end.state.summary?.open_questions.join(" ")).toContain(task.total_time);
    expect(end.state.summary?.processes[0]?.total_time).toBe(task.total_time);
  });

  it("учитывает прежний ответ при перефразировке и не спрашивает о прибыли", async () => {
    const s = stateWithTwoOpenTopics("Сколько обычно ждёте?");
    s.coverage.questions = [{ topic: TOPIC_HANDOFFS, detail: "длительность ожидания", status: "asked" }];
    mockChat.mockResolvedValueOnce({ message: "Как долго длится ожидание?", next_action: "ask", extracted_facts: [],
      question_detail: "длительность ожидания", previous_answer: "unknown" } as never);
    const first = await agentTurn(s);
    expect(first.turn.message).not.toContain("длится ожидание");
    mockChat.mockResolvedValueOnce({ message: "Что приносит меньше всего денег, но отнимает больше всего времени?", next_action: "ask", extracted_facts: [] } as never);
    const next = await agentTurn(appendUserMessage(first.state, "Не знаю"));
    expect(next.turn.message).toBe("Какая из ваших задач отнимает больше всего времени?");
  });

  it("по прямой просьбе завершает интервью и отмечает непройденные темы", async () => {
    const state = stateWithTwoOpenTopics("Что делаете?");
    state.transcript[state.transcript.length - 1].text = "хочу закончить сейчас";
    mockChat.mockResolvedValueOnce(structuredClone(summaryPayload) as never);
    const result = await agentTurn(state);
    expect(result.state.status).toBe(SESSION_STATUS.AWAITING_CONFIRMATION);
    expect(result.state.coverage.topics[TOPIC_HANDOFFS]).toBe("skipped");
    expect(result.state.coverage.topics[TOPIC_GUT]).toBe("skipped");
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it("не теряет задачи, если модель вернула пустое резюме", async () => {
    const state = stateWithOneOpenTopic();
    state.transcript[state.transcript.length - 1].text = "хочу закончить сейчас";
    state.facts.push({ type: "task", name: "Обработка документов", source: "msg#1", volume: "20 документов", duration: "5 минут на документ", total_time: "час в день" });
    mockChat.mockResolvedValueOnce({ processes: [], open_questions: [] } as never);
    const result = await agentTurn(state);
    expect(result.state.summary?.processes[0]).toMatchObject({ name: "Обработка документов", volume: "20 документов", duration: "5 минут на документ", total_time: "час в день" });
  });

  it("не добавляет рассчитанное время и неподтверждённое пожелание в резюме", async () => {
    const state = stateWithOneOpenTopic();
    state.transcript[state.transcript.length - 1].text = "хочу закончить сейчас";
    state.facts.push({ type: "task", name: "Заявки", source: "msg#1", volume: "8 заявок", duration: "15 минут" });
    mockChat.mockResolvedValueOnce({ processes: [{ name: "Заявки", steps: [], actors: [], systems: [], volume: "8 заявок", duration: "15 минут", total_time: "2 часа", improvements: ["Автоматизировать"], pain: "" }], open_questions: [] } as never);
    const result = await agentTurn(state);
    expect(result.state.summary?.processes[0].total_time).toBeUndefined();
    expect(result.state.summary?.processes[0].improvements).toEqual([]);
  });

  it("ставит интервью на паузу без изменения тем", async () => {
    const state = stateWithOneOpenTopic();
    mockChat.mockResolvedValueOnce({ message: "Вопрос", extracted_facts: [], next_action: "ask", user_intent: "pause" } as never);
    const result = await agentTurn(state);
    expect(result.turn.message).toContain("паузу");
    expect(result.state.status).toBe(SESSION_STATUS.IN_PROGRESS);
    expect(result.state.coverage.topics).toEqual(state.coverage.topics);
  });

  it("по просьбе пропускает только текущую тему", async () => {
    const state = stateWithTwoOpenTopics("Что делаете?");
    mockChat.mockResolvedValueOnce({ message: "Дальше", extracted_facts: [], next_action: "ask", user_intent: "skip_topic" } as never);
    const result = await agentTurn(state);
    expect(result.state.coverage.topics[TOPIC_HANDOFFS]).toBe("skipped");
    expect(result.state.coverage.topics[TOPIC_GUT]).toBe("open");
    expect(result.state.status).toBe(SESSION_STATUS.IN_PROGRESS);
  });

  it("сохраняет уточнение для уже открытого разбора", async () => {
    const state = stateWithOneOpenTopic();
    const topic = deepDiveTopic("Отчёты");
    state.agenda.unshift(topic);
    state.coverage.topics[topic] = "open";
    state.facts.push({ type: "task", name: "Отчёты", source: "msg#1" });
    mockChat.mockResolvedValueOnce({ message: "Какие данные вы сверяете?", extracted_facts: [], next_action: "follow_up", dive_task: "Отчёты" } as never);
    const result = await agentTurn(state);
    expect(result.turn.message).toBe("Какие данные вы сверяете?");
    expect(result.state.agenda.filter((item) => item === topic)).toHaveLength(1);
  });

  it("уточняет неоднозначное число без сохранения выдуманных фактов", async () => {
    const state = stateWithOneOpenTopic("Что вы делаете в системе?");
    state.transcript[state.transcript.length - 1].text = "20";
    mockChat.mockResolvedValueOnce({ message: "20 заказов?", extracted_facts: [{ type: "task", name: "Заказы", volume: "20 заказов", source: "msg#1" }], next_action: "ask", numeric_meaning: "unclear" } as never);
    const result = await agentTurn(state);
    expect(result.turn.message).toContain("что означает число 20");
    expect(result.state.facts).toEqual([]);
  });

  it("не собирает заново уже названные обязанности при смене темы", async () => {
    const state = stateWithOneOpenTopic();
    state.coverage.topics[TOPIC_ROLE] = "open";
    state.coverage.topics[TOPIC_TASKS] = "open";
    mockChat.mockResolvedValueOnce({ message: mainQuestionForTopic(TOPIC_TASKS), extracted_facts: [{ type: "task", name: "Обработка заявок", source: "msg#1" }], next_action: "ask", coverage_update: { topic: TOPIC_ROLE, status: "covered" } } as never);
    const result = await agentTurn(state);
    expect(result.turn.message).toContain("Обработка заявок");
    expect(result.turn.message).toContain("ещё");
    expect(result.turn.message).not.toBe(mainQuestionForTopic(TOPIC_TASKS));
  });

  it("не приписывает полученному ответу сбой доставки или опечатку", async () => {
    const state = stateWithOneOpenTopic();
    state.transcript[state.transcript.length - 1].text = "...";
    mockChat.mockResolvedValueOnce({ message: "Похоже, ответ не дошёл. Повторите?", extracted_facts: [], next_action: "ask" } as never);
    const first = await agentTurn(state);
    expect(first.turn.message).toContain("Не совсем понял");
    state.transcript[state.transcript.length - 1].text = "мою туалеты";
    mockChat.mockResolvedValueOnce({ message: "Кажется, ответ с опечаткой", extracted_facts: [], next_action: "ask" } as never);
    const second = await agentTurn(state);
    expect(second.turn.message).toContain("обязанности");
  });
  it("формирует факты для источника только из исправленного резюме", () => {
    const facts = factsFromConfirmedSummary({ processes: [{ name: "Отчёты", steps: ["Сверяет данные"], actors: [], systems: [], volume: "", pain: "", duration: "10 минут" }], open_questions: [] });
    expect(facts.map((fact) => fact.name)).toEqual(["Отчёты", "Сверяет данные"]);
    expect(facts[0].duration).toBe("10 минут");
  });
  it("не закрывает разбор, пока не описаны действия", async () => {
    const s = stateWithOneOpenTopic();
    const topic = deepDiveTopic("Отчёты");
    s.agenda.splice(s.agenda.indexOf(TOPIC_GUT), 0, topic);
    s.coverage.topics[topic] = "open";
    mockChat.mockResolvedValueOnce({ message: "Дальше", extracted_facts: [], next_action: "ask", coverage_update: { topic, status: "covered" }, dive_updates: [{ field: "input", status: "known" }] } as never);
    const result = await agentTurn(s);
    expect(result.state.coverage.topics[topic]).toBe("open");
    expect(result.state.coverage.dives?.[topic]?.input).toBe("known");
    expect(result.turn.message).toContain("Что вы сделали сначала?");
  });

  it("сохраняет отказ и позволяет завершить разбор", async () => {
    const s = stateWithOneOpenTopic();
    const topic = deepDiveTopic("Отчёты");
    s.agenda.splice(s.agenda.indexOf(TOPIC_GUT), 0, topic);
    s.coverage.topics[topic] = "open";
    mockChat.mockResolvedValueOnce({ message: "Хорошо.\n\nПродолжим?", extracted_facts: [], next_action: "ask", answer_kind: "decline", coverage_update: { topic, status: "covered" }, dive_updates: [{ field: "actions", status: "declined" }] } as never);
    const result = await agentTurn(s);
    expect(result.state.coverage.topics[topic]).toBe("covered");
    expect(result.state.coverage.dives?.[topic]?.actions).toBe("declined");
  });

  it("не добавляет четвёртый разбор и не задаёт вопрос об отклонённой задаче", async () => {
    const s = stateWithOneOpenTopic();
    s.coverage.topics[TOPIC_TASKS] = "covered";
    for (const name of ["А", "Б", "В"]) { const t = deepDiveTopic(name); s.agenda.unshift(t); s.coverage.topics[t] = "covered"; }
    s.facts.push({ type: "task", name: "Г", source: "msg#1" });
    mockChat.mockResolvedValueOnce({ message: "Разберём Г?", extracted_facts: [], next_action: "ask", dive_task: "Г", coverage_update: { topic: TOPIC_GUT, status: "covered" } } as never).mockResolvedValueOnce(structuredClone(summaryPayload) as never);
    const result = await agentTurn(s);
    expect(result.state.agenda).not.toContain(deepDiveTopic("Г"));
    expect(result.turn.message).not.toContain("Разберём Г");
  });

  it("сохраняет содержательный вопрос после четырёх коротких ответов", async () => {
    const s = stateWithOneOpenTopic();
    s.coverage.shortAnswers = 3;
    mockChat.mockResolvedValueOnce({ message: "Как часто?", extracted_facts: [], next_action: "follow_up", answer_kind: "short_substantive" } as never);
    const result = await agentTurn(s);
    expect(result.turn.message).toBe("Как часто?");
    mockChat.mockResolvedValueOnce({ message: "Что дальше?", extracted_facts: [], next_action: "follow_up", answer_kind: "short_substantive" } as never);
    const next = await agentTurn(appendUserMessage(result.state, "готовлю отчёты"));
    expect(next.turn.message).toBe("Что дальше?");
  });

  it("отбрасывает выдуманных кандидатов и неверные ссылки на сообщения", async () => {
    const s = stateWithOneOpenTopic();
    s.facts.push({ type: "task", name: "Отчёты", source: "msg#1" });
    mockChat.mockResolvedValueOnce({ message: "Как часто?", extracted_facts: [], next_action: "follow_up", candidates: [
      { task: "Отчёты", evidence: [{ description: "ежедневно", source: "msg#99" }, { description: "ручная работа", source: "msg#1" }] },
      { task: "Выдуманная задача", evidence: [{ description: "рутина", source: "msg#1" }] },
    ] } as never);
    const result = await agentTurn(s);
    expect(result.state.coverage.candidates).toEqual([{ task: "Отчёты", evidence: [{ description: "ручная работа", source: "msg#1" }] }]);
  });
});

describe("agentTurn: guard преждевременного summarize", () => {
  it("модель закрыла последнюю тему своим coverage_update — резюме сразу, без повторного вопроса", async () => {
    mockChat
      .mockResolvedValueOnce({ ...summarizeTurn, coverage_update: { topic: TOPIC_GUT, status: "covered" } } as never)
      .mockResolvedValueOnce(structuredClone(summaryPayload) as never);

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
    mockChat.mockResolvedValueOnce(summarizeTurn as never).mockResolvedValueOnce(structuredClone(summaryPayload) as never);
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
    mockChat.mockResolvedValueOnce(summarizeTurn as never).mockResolvedValueOnce(structuredClone(summaryPayload) as never);
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
      } as never).mockResolvedValueOnce(structuredClone(summaryPayload) as never);

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
      .mockResolvedValueOnce(structuredClone(summaryPayload) as never);

    const { state } = await agentTurn(s);
    expect(state.status).toBe(SESSION_STATUS.IN_PROGRESS);
    expect(state.coverage.topics[TOPIC_GUT]).toBe("open");
  });
});

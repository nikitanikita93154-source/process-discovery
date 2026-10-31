import { describe, expect, it } from "vitest";
import {
  appendUserMessage,
  applyTurn,
  currentTopicIndex,
  hasPendingUserMessage,
  onlySummaryLeft,
  type InterviewState,
} from "@/lib/agent/interview";
import {
  DEEP_DIVE_PREFIX,
  TOPIC_ROLE,
  TOPIC_TASKS,
  buildAgenda,
  deepDiveTopic,
} from "@/lib/agent/agenda";
import { SESSION_STATUS, type AgentTurn, type TranscriptItem } from "@/lib/schemas/interview";

function makeState(overrides: Partial<InterviewState> = {}): InterviewState {
  const agenda = buildAgenda([]);
  return {
    sessionId: "s1",
    userId: "u1",
    employeeName: "Иван",
    status: SESSION_STATUS.IN_PROGRESS,
    startedAt: new Date(),
    agenda: agenda.topics,
    coverage: { topics: Object.fromEntries(agenda.topics.map((t) => [t, "open"])), followUps: 0, vetoCount: 0 },
    transcript: [],
    facts: [],
    summary: null,
    ...overrides,
  };
}

function turn(t: Partial<AgentTurn> = {}): AgentTurn {
  return { message: "Вопрос?", extracted_facts: [], next_action: "ask", ...t };
}

function userMsg(text: string, topic?: string): TranscriptItem {
  return { role: "user", text, ts: new Date().toISOString(), ...(topic ? { topic } : {}) };
}

describe("currentTopicIndex / onlySummaryLeft", () => {
  it("находит первую открытую тему", () => {
    const s = makeState();
    expect(currentTopicIndex(s)).toBe(0);
  });

  it("пропускает закрытые темы", () => {
    const s = makeState();
    s.coverage.topics[TOPIC_ROLE] = "covered";
    expect(s.agenda[currentTopicIndex(s)]).toBe(TOPIC_TASKS);
  });

  it("onlySummaryLeft — истина, когда закрыто всё, кроме резюме", () => {
    const s = makeState();
    expect(onlySummaryLeft(s)).toBe(false);
    for (const t of s.agenda) {
      if (t !== "Резюме и подтверждение") s.coverage.topics[t] = "covered";
    }
    expect(onlySummaryLeft(s)).toBe(true);
  });
});

describe("appendUserMessage", () => {
  it("добавляет сообщение с темой и не дублирует повторную отправку", () => {
    const s = appendUserMessage(makeState(), "Привет");
    expect(s.transcript).toHaveLength(1);
    expect(s.transcript[0]).toMatchObject({ role: "user", text: "Привет", topic: TOPIC_ROLE });

    const retry = appendUserMessage(s, "Привет");
    expect(retry.transcript).toHaveLength(1); // ретрай не дублирует

    const other = appendUserMessage(retry, "Другое сообщение");
    expect(other.transcript).toHaveLength(2);
  });
});

describe("hasPendingUserMessage", () => {
  it("true только когда последнее сообщение — от сотрудника", () => {
    expect(hasPendingUserMessage(makeState())).toBe(false);

    const answered = applyTurn(appendUserMessage(makeState(), "Привет"), turn());
    expect(hasPendingUserMessage(answered)).toBe(false);

    expect(hasPendingUserMessage(appendUserMessage(answered, "Ещё вопрос"))).toBe(true);
  });
});

describe("applyTurn", () => {
  it("игнорирует извлечённые факты, если последнее сообщение не от сотрудника (приветствие)", () => {
    const next = applyTurn(
      makeState(),
      turn({ extracted_facts: [{ type: "task", name: "Задача", source: "" }] }),
    );
    expect(next.facts).toHaveLength(0);
    expect(next.agenda.some((t) => t.startsWith(DEEP_DIVE_PREFIX))).toBe(false);
  });

  it("перезаписывает провенанс вычисленным msg#N", () => {
    const s = makeState({
      transcript: [userMsg("первое"), { role: "assistant", text: "ок", ts: "t" }, userMsg("второе")],
    });
    const next = applyTurn(
      s,
      turn({ extracted_facts: [{ type: "step", name: "Шаг", source: "msg#99" }] }),
    );
    expect(next.facts[0].source).toBe("msg#2"); // сквозная нумерация, а не выдуманный моделью номер
  });

  it("не схлопывает одинаковые по названию факты разных акторов", () => {
    const s = makeState({
      facts: [{ type: "step", name: "Обработка заявок", actor: "Иван", source: "msg#1" }],
      transcript: [userMsg("...")],
    });
    const next = applyTurn(
      s,
      turn({ extracted_facts: [{ type: "step", name: "обработка заявок", actor: "Мария", source: "" }] }),
    );
    expect(next.facts).toHaveLength(2);
  });

  it("мерджит повторный факт: дополняет частоту и объём", () => {
    const s = makeState({
      facts: [{ type: "step", name: "Обработка заявок", actor: "Иван", source: "msg#1" }],
      transcript: [userMsg("...")],
    });
    const next = applyTurn(
      s,
      turn({
        extracted_facts: [
          { type: "step", name: "Обработка заявок", actor: "Иван", frequency: "5 раз в день", volume: "30 заявок", source: "" },
        ],
      }),
    );
    expect(next.facts).toHaveLength(1);
    expect(next.facts[0]).toMatchObject({ frequency: "5 раз в день", volume: "30 заявок" });
  });

  it("сначала собирает задачи, затем разбирает выбранную рутину", () => {
    const s = makeState({ transcript: [userMsg("готовлю отчёты")] });
    const initial = applyTurn(
      s,
      turn({ extracted_facts: [{ type: "task", name: "Готовка отчётов", source: "" }] }),
    );
    const dd = deepDiveTopic("Готовка отчётов");
    expect(initial.agenda).not.toContain(dd);
    initial.coverage.topics[TOPIC_ROLE] = "covered";
    const next = applyTurn(initial, turn({ dive_task: "Готовка отчётов", coverage_update: { topic: TOPIC_TASKS, status: "covered" } }));
    expect(next.agenda).toContain(dd);
    expect(next.agenda.indexOf(dd)).toBe(next.agenda.indexOf(TOPIC_TASKS) + 1);
    expect(next.coverage.topics[dd]).toBe("open");
  });

  it("добавляет обнаруженную позже рутину перед следующей открытой темой", () => {
    const s = makeState({ transcript: [userMsg("После встречи переношу заметки в CRM")] });
    s.coverage.topics[TOPIC_ROLE] = "covered";
    s.coverage.topics[TOPIC_TASKS] = "covered";
    const topic = s.agenda[currentTopicIndex(s)];
    const next = applyTurn(s, turn({
      extracted_facts: [{ type: "task", name: "Перенос заметок в CRM", source: "" }],
      dive_task: "Перенос заметок в CRM",
      coverage_update: { topic, status: "covered" },
    }));
    expect(next.agenda[currentTopicIndex(next)]).toBe(deepDiveTopic("Перенос заметок в CRM"));
  });

  it("не начинает разбор задачи, которую сотрудник не называл", () => {
    const s = makeState({ transcript: [userMsg("готовлю отчёты")] });
    s.coverage.topics[TOPIC_ROLE] = "covered";
    s.coverage.topics[TOPIC_TASKS] = "covered";
    const topic = s.agenda[currentTopicIndex(s)];
    const next = applyTurn(s, turn({ dive_task: "Выдуманная задача", coverage_update: { topic, status: "covered" } }));
    expect(next.agenda).not.toContain(deepDiveTopic("Выдуманная задача"));
  });

  it("применяет coverage_update", () => {
    const next = applyTurn(
      makeState({ transcript: [userMsg("...")] }),
      turn({ coverage_update: { topic: TOPIC_ROLE, status: "covered" } }),
    );
    expect(next.coverage.topics[TOPIC_ROLE]).toBe("covered");
  });

  it("число уточнений не закрывает тему", () => {
    let s = makeState({ transcript: [userMsg("a")] });
    s = applyTurn(s, turn({ next_action: "follow_up" }));
    expect(s.coverage.followUps).toBe(1);
    s = applyTurn(s, turn({ next_action: "follow_up" }));
    expect(s.coverage.followUps).toBe(2);
    s = applyTurn({ ...s, transcript: [...s.transcript, userMsg("b")] }, turn({ next_action: "follow_up" }));
    expect(s.coverage.followUps).toBe(3);
    for (let i = 0; i < 3; i++) s = applyTurn(s, turn({ next_action: "follow_up" }));
    expect(s.coverage.followUps).toBe(6);
    expect(s.coverage.topics[TOPIC_ROLE]).toBe("open");
  });

  it("помечает сообщение агента темой хода", () => {
    const next = applyTurn(appendUserMessage(makeState(), "Привет"), turn());
    const last = next.transcript[next.transcript.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.topic).toBe(TOPIC_ROLE);
  });

  it("решение «на глазок» (type=decision) не порождает дип-дайв", () => {
    const s = makeState({ transcript: [userMsg("решаю по интуиции")] });
    const next = applyTurn(
      s,
      turn({ extracted_facts: [{ type: "decision", name: "Дожимать клиента по интонации", source: "" }] }),
    );
    expect(next.facts).toHaveLength(1);
    expect(next.facts[0].type).toBe("decision");
    expect(next.agenda.some((t) => t.startsWith(DEEP_DIVE_PREFIX))).toBe(false);
  });

  it("duration сохраняется и мерджится при повторе факта", () => {
    const s = makeState({ transcript: [userMsg("делаю")] });
    const first = applyTurn(s, turn({ extracted_facts: [{ type: "step", name: "Внесение в CRM", source: "" }] }));
    const second = applyTurn(
      { ...first, transcript: [...first.transcript, userMsg("ещё")] },
      turn({ extracted_facts: [{ type: "step", name: "Внесение в CRM", duration: "5 минут", source: "" }] }),
    );
    expect(second.facts).toHaveLength(1);
    expect(second.facts[0].duration).toBe("5 минут");
  });
});

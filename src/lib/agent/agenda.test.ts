import { describe, expect, it } from "vitest";
import {
  CORE_TOPICS,
  DEEP_DIVE_PREFIX,
  FOLLOW_UP_PREFIX,
  MAX_DEEP_DIVES,
  TOPIC_GUT,
  TOPIC_ROLE,
  TOPIC_SUMMARY,
  TOPIC_TASKS,
  buildAgenda,
  deepDiveTopic,
  extendAgendaWithTasks,
  mainQuestionForTopic,
} from "@/lib/agent/agenda";

describe("buildAgenda", () => {
  it("скелетные темы + follow-up вопросы + резюме в конце", () => {
    const { topics } = buildAgenda(["Про Эксель?"]);
    expect(topics).toEqual([
      ...CORE_TOPICS.map((t) => t.title),
      `${FOLLOW_UP_PREFIX}Про Эксель?`,
      TOPIC_SUMMARY,
    ]);
  });
});

describe("mainQuestionForTopic", () => {
  it("знает главные вопросы скелетных тем", () => {
    for (const t of CORE_TOPICS) {
      expect(mainQuestionForTopic(t.title)).toBe(t.mainQuestion);
    }
  });

  it("вопрос роли явно спрашивает должность и отдел", () => {
    const q = mainQuestionForTopic(TOPIC_ROLE);
    expect(q).toContain("должность");
    expect(q).toContain("отдел");
  });

  it("вопрос темы «на глазок» спрашивает про рутину для робота", () => {
    expect(mainQuestionForTopic(TOPIC_GUT)).toContain("роботу");
  });

  it("генерирует вопрос дип-дайва по названию задачи", () => {
    expect(mainQuestionForTopic(deepDiveTopic("Отчёты"))).toContain("Отчёты");
  });

  it("follow-up вопрос — сам вопрос без префикса", () => {
    expect(mainQuestionForTopic(`${FOLLOW_UP_PREFIX}Как часто?`)).toBe("Как часто?");
  });

  it("fallback для неизвестной темы", () => {
    expect(mainQuestionForTopic("Что-то новое")).toContain("Что-то новое");
  });
});

describe("extendAgendaWithTasks", () => {
  const emptyCoverage: Record<string, "open" | "covered" | "skipped"> = {};

  it("вставляет дип-дайв после «Основных задач»", () => {
    const agenda = buildAgenda([]).topics;
    const res = extendAgendaWithTasks(agenda, emptyCoverage, ["Задача 1"]);
    expect(res).not.toBeNull();
    expect(res!.agenda.indexOf(deepDiveTopic("Задача 1"))).toBe(agenda.indexOf(TOPIC_TASKS) + 1);
    expect(res!.coverage[deepDiveTopic("Задача 1")]).toBe("open");
  });

  it("не дублирует существующий дип-дайв (нормализация)", () => {
    const agenda = buildAgenda([]).topics;
    const once = extendAgendaWithTasks(agenda, emptyCoverage, ["Задача 1"])!;
    expect(extendAgendaWithTasks(once.agenda, once.coverage, ["задача 1"])).toBeNull();
  });

  it("ограничивает число дип-дайвов MAX_DEEP_DIVES", () => {
    let agenda = buildAgenda([]).topics;
    let coverage = emptyCoverage;
    for (let i = 1; i <= MAX_DEEP_DIVES; i++) {
      const res = extendAgendaWithTasks(agenda, coverage, [`Задача ${i}`])!;
      agenda = res.agenda;
      coverage = res.coverage;
    }
    expect(agenda.filter((t) => t.startsWith(DEEP_DIVE_PREFIX))).toHaveLength(MAX_DEEP_DIVES);
    expect(extendAgendaWithTasks(agenda, coverage, ["Задача 4"])).toBeNull();
  });
});

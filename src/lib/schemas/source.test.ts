import { describe, expect, it } from "vitest";
import { factsToParsedSource } from "@/lib/schemas/source";
import { interviewSummarySchema } from "@/lib/schemas/interview";

describe("interviewSummarySchema", () => {
  it("пустой объект → дефолты, без ошибок", () => {
    const s = interviewSummarySchema.parse({});
    expect(s.processes).toEqual([]);
    expect(s.open_questions).toEqual([]);
  });

  it("процесс без volume/pain получает пустые строки, а не ошибку", () => {
    const s = interviewSummarySchema.parse({ processes: [{ name: "Отчёты" }] });
    expect(s.processes[0]).toMatchObject({ name: "Отчёты", volume: "", pain: "", steps: [] });
  });
});

describe("factsToParsedSource", () => {
  const parsed = factsToParsedSource({
    facts: [
      { type: "step", name: "Собрать данные", actor: "Иван", frequency: "раз в день", source: "msg#1" },
      { type: "task", name: "Отчёты", source: "msg#1" },
      { type: "actor", name: "Иван", source: "msg#1" },
      { type: "system", name: "Excel", source: "msg#2" },
      { type: "exception", name: "Частые переделки", source: "msg#2" },
    ],
    summary: {
      processes: [
        {
          name: "Отчёты",
          steps: ["Собрать данные", "Свести таблицу", "Отправить руководителю"],
          actors: ["Иван"],
          systems: ["Почта"],
          volume: "",
          pain: "",
        },
      ],
      open_questions: [],
    },
    citationRef: "Интервью: Иван",
  });

  it("step/task факты + шаги резюме без дублей", () => {
    expect(parsed.candidateSteps.map((s) => s.name)).toEqual([
      "Собрать данные",
      "Отчёты",
      "Свести таблицу",
      "Отправить руководителю",
    ]);
  });

  it("шаги из резюме несут провенанс резюме", () => {
    const step = parsed.candidateSteps.find((s) => s.name === "Свести таблицу");
    expect(step?.source).toBe("резюме: Отчёты");
  });

  it("актёры и системы — объединение фактов и резюме", () => {
    expect(parsed.actors).toContain("Иван");
    expect(parsed.systems).toEqual(expect.arrayContaining(["Excel", "Почта"]));
  });

  it("исключения становятся правилами с цитатой интервью", () => {
    expect(parsed.exceptions).toEqual(["Частые переделки"]);
    expect(parsed.rules[0]).toEqual({ text: "Частые переделки", source: "Интервью: Иван" });
  });

  it("цитаты ссылаются на процессы резюме", () => {
    expect(parsed.citations).toContainEqual({ ref: "Интервью: Иван" });
    expect(parsed.citations).toContainEqual({ ref: "резюме: Отчёты" });
  });

  it("решения «на глазок» уходят в gutDecisions, не в candidateSteps", () => {
    const p = factsToParsedSource({
      facts: [
        { type: "decision", name: "Дожимать клиента по интонации", source: "msg#9" },
        { type: "step", name: "Обычный шаг", source: "msg#1" },
      ],
      summary: { processes: [], open_questions: [] },
      citationRef: "X",
    });
    expect(p.gutDecisions).toEqual(["Дожимать клиента по интонации"]);
    expect(p.candidateSteps.map((s) => s.name)).toEqual(["Обычный шаг"]);
  });

  it("duration прокидывается в шаги источника", () => {
    const p = factsToParsedSource({
      facts: [{ type: "task", name: "Рутина", duration: "10–15 минут", source: "msg#2" }],
      summary: { processes: [], open_questions: [] },
      citationRef: "X",
    });
    expect(p.candidateSteps[0].duration).toBe("10–15 минут");
  });
});

import { describe, expect, it } from "vitest";
import { buildInterviewIndex, hoursFromFacts, matchDurationText } from "@/lib/scoring";
import type { MapStep } from "@/lib/schemas/map";
import type { ParsedSource } from "@/lib/schemas/source";

function source(overrides: Record<string, unknown>): ParsedSource {
  return {
    candidateSteps: [],
    actors: [],
    systems: [],
    gutDecisions: [],
    rules: [],
    exceptions: [],
    citations: [],
    ...overrides,
  } as ParsedSource;
}

describe("matchDurationText", () => {
  it("парсит диапазоны, одиночные значения и словесные формы", () => {
    expect(matchDurationText("10–15 минут")).toBe(12.5);
    expect(matchDurationText("10-15 мин на один проход")).toBe(12.5);
    expect(matchDurationText("20 минут")).toBe(20);
    expect(matchDurationText("полчаса")).toBe(30);
    expect(matchDurationText("1,5 часа")).toBe(90);
    expect(matchDurationText("2 ч")).toBe(120);
    expect(matchDurationText("час")).toBe(60);
  });

  it("не выдумывает длительность из нерелевантного текста", () => {
    expect(matchDurationText("постоянно")).toBeNull();
    expect(matchDurationText("ежедневно")).toBeNull();
    expect(matchDurationText(undefined)).toBeNull();
  });
});

describe("hoursFromFacts", () => {
  it("использует реальную длительность из факта вместо средней константы", () => {
    const idx = buildInterviewIndex([
      source({ candidateSteps: [{ name: "Внесение данных в CRM", frequency: "10 раз в день", duration: "30 минут" }] }),
    ]);
    // 10 раз в день → 50/нед; 50 × 30 мин × 52 / 60 = 1300 ч/год
    const r = hoursFromFacts({ name: "Внесение данных в CRM" } as MapStep, idx);
    expect(r).toEqual({ hours: 1300, estimate: false });
  });

  it("без длительности — средняя константа 20 мин", () => {
    const idx = buildInterviewIndex([
      source({ candidateSteps: [{ name: "Шаг", frequency: "раз в день" }] }),
    ]);
    // 5/нед × 20 мин × 52 / 60 ≈ 86,67 ч/год
    const r = hoursFromFacts({ name: "Шаг" } as MapStep, idx);
    expect(r?.estimate).toBe(false);
    expect(r?.hours).toBeCloseTo((5 * 20 * 52) / 60, 5);
  });

  it("длительность без частоты не даёт часов — null", () => {
    const idx = buildInterviewIndex([source({ candidateSteps: [{ name: "Шаг", duration: "30 минут" }] })]);
    expect(hoursFromFacts({ name: "Шаг" } as MapStep, idx)).toBeNull();
  });
});

describe("buildInterviewIndex", () => {
  it("явные gutDecisions поднимают флаг hasGutDecisions без регэкспа", () => {
    const idx = buildInterviewIndex([source({ gutDecisions: ["Дожимать клиента по настроению"] })]);
    expect(idx.hasGutDecisions).toBe(true);
    expect(idx.hasTemplateTexts).toBe(false);
  });

  it("тексты фактов интервью тоже дают признаки шаблонной рутины", () => {
    const idx = buildInterviewIndex([
      source({
        interview: {
          summary: { processes: [{ name: "Рутина", pain: "" }], open_questions: [] },
          facts: [{ type: "task", name: "Копирование текстов из заметок", source: "msg#2" }],
        },
      }),
    ]);
    expect(idx.hasTemplateTexts).toBe(true);
  });
});

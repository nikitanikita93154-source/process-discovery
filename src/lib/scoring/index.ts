import type { MapStep, ProcessMapJson } from "@/lib/schemas/map";
import type { Test1Answers } from "@/lib/schemas/test1";
import type { ScoredStep, Stp } from "@/lib/schemas/analysis";
import type { ParsedSource } from "@/lib/schemas/source";
import { MAX_SAVINGS_RATIO, SCORING_WEIGHTS } from "@/lib/scoring/weights";

// ============================================================
// Детерминированный скоринг шагов карты (без LLM).
// hoursPerYear — из фактов Т1/Т2 (частота × время × 52);
// при отсутствии — вызывающий код получает null и решает,
// чем заполнить (оценка LLM с пометкой estimate).
// ============================================================

/** Раз в неделю (оценка частот из Теста 1). */
const FREQUENCY_PER_WEEK: Record<string, number> = {
  "несколько раз в день": 15,
  "раз в день": 5,
  "несколько раз в неделю": 3,
  "раз в неделю": 1,
  реже: 0.5,
};

/** Минут на выполнение (средние значения диапазонов Теста 1). */
const DURATION_MINUTES: Record<string, number> = {
  "<5 мин": 4,
  "5–15 мин": 10,
  "15–60 мин": 35,
  ">60 мин": 75,
};

/** Доступность данных по системе (0–100). */
const DATA_AVAILABILITY: Record<string, number> = {
  "1С": 90,
  CRM: 90,
  Excel: 85,
  почта: 60,
  мессенджеры: 40,
  бумага: 15,
  другое: 40,
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

export interface T1TaskIndexEntry {
  frequency: string;
  duration: string;
  systems: string[];
  irritation: number;
  regulated: string;
}

/** Индекс задач Теста 1 по нормализованному названию. */
export function buildT1Index(answers: Test1Answers[]): Map<string, T1TaskIndexEntry> {
  const index = new Map<string, T1TaskIndexEntry>();
  for (const a of answers) {
    for (const t of a.tasks) {
      index.set(norm(t.title), {
        frequency: t.frequency,
        duration: t.duration,
        systems: [...t.systems, ...(t.systemsCustom ? [t.systemsCustom] : [])],
        irritation: t.irritation,
        regulated: t.regulated,
      });
    }
  }
  return index;
}

/** Частота/объём из фактов интервью (шаги источника). */
export interface InterviewFactsIndex {
  /** norm(имя шага) → { frequency, volume } из parsed источников */
  entries: Map<string, { frequency?: string; volume?: string }>;
  hasTemplateTexts: boolean;
  hasGutDecisions: boolean;
}

export function buildInterviewIndex(sources: ParsedSource[], t1: Test1Answers[]): InterviewFactsIndex {
  const entries = new Map<string, { frequency?: string; volume?: string }>();
  for (const s of sources) {
    for (const step of s.candidateSteps) {
      const key = norm(step.name);
      const existing = entries.get(key) ?? {};
      entries.set(key, {
        frequency: step.frequency ?? existing.frequency,
        volume: step.volume ?? existing.volume,
      });
    }
  }
  return {
    entries,
    hasTemplateTexts: t1.some((a) => a.templateTexts?.frequency === "постоянно" || a.templateTexts?.frequency === "иногда"),
    hasGutDecisions: t1.some((a) => a.gutDecisions?.hasGutDecisions === true),
  };
}

function matchT1(stepName: string, index: Map<string, T1TaskIndexEntry>): T1TaskIndexEntry | null {
  const key = norm(stepName);
  if (index.has(key)) return index.get(key)!;
  // частичное совпадение названия
  for (const [k, v] of index) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

function matchFrequencyText(text: string | undefined): number | null {
  if (!text) return null;
  for (const [freq, perWeek] of Object.entries(FREQUENCY_PER_WEEK)) {
    if (text.includes(freq) || norm(text).includes(norm(freq))) return perWeek;
  }
  // числовые формулировки из интервью: "5 раз в день" и т.п.
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*раз\s*в\s*(день|неделю|месяц)/i);
  if (m) {
    const n = Number.parseFloat(m[1].replace(",", "."));
    if (m[2].toLowerCase() === "день") return n * 5;
    if (m[2].toLowerCase() === "неделю") return n;
    return n / 4;
  }
  return null;
}

/** Часов в год из фактов (частота × время × 52). null → данных нет. */
export function hoursFromFacts(
  step: MapStep,
  t1Index: Map<string, T1TaskIndexEntry>,
  interviewIndex: InterviewFactsIndex,
): { hours: number; estimate: boolean } | null {
  const t1 = matchT1(step.name, t1Index);
  if (t1) {
    const perWeek = FREQUENCY_PER_WEEK[t1.frequency] ?? matchFrequencyText(t1.frequency);
    const minutes = DURATION_MINUTES[t1.duration];
    if (perWeek !== undefined && minutes) {
      return { hours: (perWeek * minutes * 52) / 60, estimate: false };
    }
  }
  const fact = interviewIndex.entries.get(norm(step.name));
  if (fact) {
    const perWeek = matchFrequencyText(fact.frequency) ?? matchFrequencyText(fact.volume);
    if (perWeek !== null) {
      // из интервью известна частота; длительность берём среднюю по диапазонам Т1, помечаем как факт
      return { hours: (perWeek * 20 * 52) / 60, estimate: false };
    }
  }
  return null;
}

function dataAvailabilityScore(systems: string[]): number {
  let max = 30; // система не указана
  for (const sys of systems) {
    const key = Object.keys(DATA_AVAILABILITY).find((k) => norm(sys).includes(norm(k)));
    if (key) max = Math.max(max, DATA_AVAILABILITY[key]);
  }
  return max;
}

/** Подсказка технологии — детерминированные правила if/else. */
export function suggestTech(
  step: MapStep,
  ctx: {
    repetitiveness: number;
    formalizability: number;
    dataAvailability: number;
    hasTemplateTexts: boolean;
    hasGutDecisions: boolean;
    handoffs: number;
  },
): string {
  const systemsText = step.system.toLowerCase();
  if (ctx.hasTemplateTexts && /пис|ответ|отчёт|шаблон|текст|к[пп]|письм/.test(step.name.toLowerCase())) {
    return "LLM (генерация текстов по шаблонам)";
  }
  if (ctx.handoffs >= 2 && ctx.formalizability >= 50) {
    return "Workflow / оркестрация (цепочка передач)";
  }
  if (ctx.hasGutDecisions && ctx.dataAvailability < 60) {
    return "ML-прогноз (решения без данных)";
  }
  if (ctx.repetitiveness >= 60 && ctx.formalizability >= 50 && /1с|excel|crm|почт|браузер|табл/i.test(systemsText || "excel")) {
    return "RPA (рутинные однотипные операции)";
  }
  return "Не определена — нужен дополнительный анализ";
}

export interface ScoreStepInput {
  map: ProcessMapJson;
  t1Index: Map<string, T1TaskIndexEntry>;
  interviewIndex: InterviewFactsIndex;
  hourlyRate: number;
  /** Оценки LLM для шагов без фактов (norm name → часов/год). */
  llmEstimates: Map<string, number>;
}

/** Полный расчёт: часы, стоимость, automationScore, технологии, приоритет, STP. */
export function scoreMap(input: ScoreStepInput): { steps: ScoredStep[]; totals: { hoursPerYear: number; costPerYear: number }; stp: Stp } {
  const { map, t1Index, interviewIndex, hourlyRate, llmEstimates } = input;

  const steps: ScoredStep[] = [];
  const hoursList: { step: MapStep; hours: number; estimate: boolean }[] = [];

  for (const stage of map.stages) {
    for (const step of stage.steps) {
      const fromFacts = hoursFromFacts(step, t1Index, interviewIndex);
      let hours: number;
      let estimate: boolean;
      if (fromFacts) {
        hours = fromFacts.hours;
        estimate = fromFacts.estimate;
      } else {
        const llm = llmEstimates.get(norm(step.name));
        hours = llm ?? 20; // консервативная заглушка, если и LLM не дал оценки
        estimate = true;
      }
      hoursList.push({ step, hours, estimate });
    }
  }

  const maxHours = Math.max(...hoursList.map((h) => h.hours), 1);

  for (let i = 0; i < hoursList.length; i++) {
    const { step, hours, estimate } = hoursList[i];
    const stage = map.stages.find((s) => s.steps.some((x) => x.id === step.id))!;
    const t1 = matchT1(step.name, t1Index);

    const perWeek = t1 ? (FREQUENCY_PER_WEEK[t1.frequency] ?? 3) : (matchFrequencyText(interviewIndex.entries.get(norm(step.name))?.frequency) ?? 3);
    const repetitiveness = Math.min(100, Math.round((perWeek / 15) * 100));

    const regulatedBonus = t1 ? (t1.regulated === "да" ? 40 : t1.regulated === "не знаю" ? 20 : 5) : 20;
    const formalizability = Math.min(
      100,
      (step.decisions.length > 0 ? 40 : 20) + regulatedBonus + (step.system ? 20 : 0),
    );

    const volume = Math.round((hours / maxHours) * 100);

    const systems = t1?.systems ?? [];
    const dataAvailability = dataAvailabilityScore([step.system, ...systems].filter(Boolean));

    const pain = t1 ? ((t1.irritation - 1) / 4) * 80 + 20 : 40;

    const automationScore = Math.round(
      repetitiveness * SCORING_WEIGHTS.repetitiveness +
        formalizability * SCORING_WEIGHTS.formalizability +
        volume * SCORING_WEIGHTS.volume +
        dataAvailability * SCORING_WEIGHTS.dataAvailability +
        pain * SCORING_WEIGHTS.pain,
    );

    // handoffs: сколько разных акторов участвует в стадии (передачи)
    const handoffs = new Set(stage.steps.map((s) => s.actor).filter(Boolean)).size;

    const tech = suggestTech(step, {
      repetitiveness,
      formalizability,
      dataAvailability,
      hasTemplateTexts: interviewIndex.hasTemplateTexts,
      hasGutDecisions: interviewIndex.hasGutDecisions,
      handoffs,
    });

    const impact = ((hours / maxHours) * 0.5 + automationScore / 100 * 0.5) * 100;
    const feasibility = (dataAvailability * 0.6 + formalizability * 0.4);
    const priority = Math.round(Math.min(100, impact * 0.6 + feasibility * 0.4));

    steps.push({
      stepId: step.id,
      stepName: step.name,
      stage: stage.name,
      actor: step.actor,
      hoursPerYear: Math.round(hours * 10) / 10,
      hoursEstimate: estimate,
      costPerYear: Math.round(hours * hourlyRate),
      automationScore,
      breakdown: { repetitiveness, formalizability, volume, dataAvailability, pain: Math.round(pain) },
      suggestTech: tech,
      priority,
    });
  }

  const totalHours = steps.reduce((a, s) => a + s.hoursPerYear, 0);
  const totalCost = steps.reduce((a, s) => a + s.costPerYear, 0);
  // Прогноз: экономия пропорциональна automationScore, максимум MAX_SAVINGS_RATIO
  const avgScore = steps.length > 0 ? steps.reduce((a, s) => a + s.automationScore, 0) / steps.length : 0;
  const savings = Math.min(MAX_SAVINGS_RATIO, (avgScore / 100) * MAX_SAVINGS_RATIO * 1.2);

  return {
    steps: steps.sort((a, b) => b.automationScore - a.automationScore),
    totals: {
      hoursPerYear: Math.round(totalHours),
      costPerYear: Math.round(totalCost),
    },
    stp: {
      currentHours: Math.round(totalHours),
      forecastHours: Math.round(totalHours * (1 - savings)),
      currentCost: Math.round(totalCost),
      forecastCost: Math.round(totalCost * (1 - savings)),
    },
  };
}

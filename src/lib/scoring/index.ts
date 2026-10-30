import type { MapStep, ProcessMapJson } from "@/lib/schemas/map";
import type { ScoredStep, Stp } from "@/lib/schemas/analysis";
import type { ParsedSource } from "@/lib/schemas/source";
import { MAX_SAVINGS_RATIO, SCORING_WEIGHTS } from "@/lib/scoring/weights";

// ============================================================
// Детерминированный скоринг шагов карты (без LLM).
// hoursPerYear — из фактов интервью (частота × длительность × 52,
// длительность по умолчанию — средняя); при отсутствии — вызывающий
// код получает null и решает, чем заполнить (оценка LLM с пометкой estimate).
// ============================================================

/** Раз в неделю (оценка частот из текстов интервью). */
const FREQUENCY_PER_WEEK: Record<string, number> = {
  "несколько раз в день": 15,
  "раз в день": 5,
  "несколько раз в неделю": 3,
  "раз в неделю": 1,
  реже: 0.5,
};

/** Средняя длительность шага, если в интервью не звучало точное время. */
const AVG_STEP_MINUTES = 20;

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

/** Частота/объём/система/длительность из фактов интервью (шаги источника). */
export interface InterviewFactsIndex {
  /** norm(имя шага) → { frequency, volume, system, duration } из parsed источников */
  entries: Map<string, { frequency?: string; volume?: string; system?: string; duration?: string }>;
  hasTemplateTexts: boolean;
  hasGutDecisions: boolean;
}

export function buildInterviewIndex(sources: ParsedSource[]): InterviewFactsIndex {
  const entries = new Map<string, { frequency?: string; volume?: string; system?: string; duration?: string }>();
  const gutDecisionTexts: string[] = [];
  for (const s of sources) {
    for (const step of s.candidateSteps) {
      const key = norm(step.name);
      const existing = entries.get(key) ?? {};
      entries.set(key, {
        frequency: step.frequency ?? existing.frequency,
        volume: step.volume ?? existing.volume,
        system: step.system ?? existing.system,
        duration: step.duration ?? existing.duration,
      });
    }
    gutDecisionTexts.push(...(s.gutDecisions ?? []));
  }

  // Признаки «шаблонных текстов» и решений «на глазок» — из текстов
  // резюме и фактов интервью, детерминированно
  let interviewText = gutDecisionTexts.join("\n");
  for (const s of sources) {
    const interview = (s as {
      interview?: {
        summary?: { processes?: { name?: string; pain?: string }[]; open_questions?: string[] };
        facts?: { type?: string; name?: string }[];
      };
    }).interview;
    if (!interview?.summary) continue;
    interviewText += "\n" + [
      ...(interview.summary.processes ?? []).map((p) => `${p.name} ${p.pain ?? ""}`),
      ...(interview.summary.open_questions ?? []),
      ...(interview.facts ?? []).map((f) => `${f.type ?? ""} ${f.name ?? ""}`),
    ].join("\n");
  }
  const lower = interviewText.toLowerCase();
  return {
    entries,
    // «копир» покрывает копирую/копируют/копирование/копировать
    hasTemplateTexts: /шаблон|копир|однотипн|типовыс|по образцу/.test(lower),
    // явные decision-факты надёжнее регэкспа по тексту
    hasGutDecisions: gutDecisionTexts.length > 0 || /на глазок|по опыту|без данных|интуи/.test(lower),
  };
}

function matchFrequencyText(text: string | undefined): number | null {
  if (!text) return null;
  // числовые формулировки из интервью: "5 раз в день" и т.п. —
  // проверяем ДО словаря, иначе «10 раз в день» матчится на «раз в день»
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*раз\s*в\s*(день|неделю|месяц)/i);
  if (m) {
    const n = Number.parseFloat(m[1].replace(",", "."));
    if (m[2].toLowerCase() === "день") return n * 5;
    if (m[2].toLowerCase() === "неделю") return n;
    return n / 4;
  }
  for (const [freq, perWeek] of Object.entries(FREQUENCY_PER_WEEK)) {
    if (text.includes(freq) || norm(text).includes(norm(freq))) return perWeek;
  }
  return null;
}

/** Минуты из текста длительности: «10–15 минут», «полчаса», «1,5 часа». */
export function matchDurationText(text: string | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(",", ".");
  if (/полминуты/.test(t)) return 0.5;
  if (/полчаса/.test(t)) return 30;
  const rangeMin = t.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*(?:мин|минут)/);
  if (rangeMin) return (Number(rangeMin[1]) + Number(rangeMin[2])) / 2;
  const rangeHour = t.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*(?:ч|час)/);
  if (rangeHour) return ((Number(rangeHour[1]) + Number(rangeHour[2])) / 2) * 60;
  const min = t.match(/(\d+(?:\.\d+)?)\s*(?:мин|минут)/);
  if (min) return Number(min[1]);
  const hour = t.match(/(\d+(?:\.\d+)?)\s*(?:ч|час)/);
  if (hour) return Number(hour[1]) * 60;
  if (/час/.test(t)) return 60; // «час» без числа
  return null;
}

/** Часов в год из фактов (частота × длительность × 52). null → данных нет. */
export function hoursFromFacts(
  step: MapStep,
  interviewIndex: InterviewFactsIndex,
): { hours: number; estimate: boolean } | null {
  const fact = interviewIndex.entries.get(norm(step.name));
  if (fact) {
    const perWeek = matchFrequencyText(fact.frequency) ?? matchFrequencyText(fact.volume);
    if (perWeek !== null) {
      // из интервью известна частота; длительность — из факта,
      // если звучала, иначе средняя константа
      const minutes = matchDurationText(fact.duration) ?? AVG_STEP_MINUTES;
      return { hours: (perWeek * minutes * 52) / 60, estimate: false };
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
  interviewIndex: InterviewFactsIndex;
  hourlyRate: number;
  /** Оценки LLM для шагов без фактов (norm name → часов/год). */
  llmEstimates: Map<string, number>;
}

/** Полный расчёт: часы, стоимость, automationScore, технологии, приоритет, STP. */
export function scoreMap(input: ScoreStepInput): { steps: ScoredStep[]; totals: { hoursPerYear: number; costPerYear: number }; stp: Stp } {
  const { map, interviewIndex, hourlyRate, llmEstimates } = input;

  const steps: ScoredStep[] = [];
  const hoursList: { step: MapStep; hours: number; estimate: boolean }[] = [];

  for (const stage of map.stages) {
    for (const step of stage.steps) {
      const fromFacts = hoursFromFacts(step, interviewIndex);
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

    const perWeek = matchFrequencyText(interviewIndex.entries.get(norm(step.name))?.frequency) ?? 3;
    const repetitiveness = Math.min(100, Math.round((perWeek / 15) * 100));

    const regulatedBonus = 20; // из интервью регламентированность не извлекается — нейтрально
    const formalizability = Math.min(
      100,
      (step.decisions.length > 0 ? 40 : 20) + regulatedBonus + (step.system ? 20 : 0),
    );

    const volume = Math.round((hours / maxHours) * 100);

    const factSystem = interviewIndex.entries.get(norm(step.name))?.system;
    const dataAvailability = dataAvailabilityScore([step.system, factSystem].filter(Boolean) as string[]);

    const pain = 40; // нейтрально: из интервью боль учитывается в тексте резюме, не в скоринге шага

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

import type { Test1Answers } from "@/lib/schemas/test1";

// ============================================================
// Повестка интервью: фиксированный скелет тем + FollowUp-вопросы.
// Темы, отмеченные в Тесте 1 как отсутствующие, исключаются.
// ============================================================

export interface Agenda {
  topics: string[];
  /** Темы, исключённые из-за ответов Теста 1 (для объяснения в UI). */
  excluded: string[];
}

export const TOPIC_GREETING = "Приветствие и правила";
export const TOPIC_HANDOFFS = "Передачи и ожидания";
export const TOPIC_ERRORS = "Ошибки и переделки";
export const TOPIC_GUT = "Данные и решения «на глазок»";
export const TOPIC_SUMMARY = "Резюме и подтверждение";

export function buildAgenda(t1: Test1Answers | null, followUps: string[]): Agenda {
  const topics: string[] = [TOPIC_GREETING];
  const excluded: string[] = [];

  // Дип-дайвы по задачам Теста 1 (до 3)
  for (const task of t1?.tasks ?? []) {
    topics.push(`Дип-дайв задачи: ${task.title}`);
  }

  // Углубления блоков Теста 1 — исключаем отсутствующие темы
  const expectations = t1?.expectations;
  const hasExpectations = expectations !== undefined && expectations.waitingFrequency > 1;
  if (hasExpectations) topics.push(TOPIC_HANDOFFS);
  else excluded.push(TOPIC_HANDOFFS);

  const mistakes = t1?.mistakes;
  const hasMistakes = mistakes !== undefined && Boolean(mistakes.tasksWithErrors?.trim() || mistakes.causes.length > 0);
  if (hasMistakes) topics.push(TOPIC_ERRORS);
  else excluded.push(TOPIC_ERRORS);

  const gut = t1?.gutDecisions;
  if (gut?.hasGutDecisions === true) topics.push(TOPIC_GUT);
  else excluded.push(TOPIC_GUT);

  // FollowUp-вопросы из комментариев к картам
  for (const q of followUps) {
    topics.push(`Дополнительный вопрос: ${q}`);
  }

  topics.push(TOPIC_SUMMARY);
  return { topics, excluded };
}

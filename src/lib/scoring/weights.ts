// ============================================================
// Веса факторов automationScore 0–100 (константы, детерминированный скоринг).
// ============================================================

export const SCORING_WEIGHTS = {
  repetitiveness: 0.25, // повторяемость
  formalizability: 0.25, // формализуемость правил
  volume: 0.2, // объём
  dataAvailability: 0.15, // доступность данных
  pain: 0.15, // боль
} as const;

export const FACTOR_LABELS: Record<keyof typeof SCORING_WEIGHTS, string> = {
  repetitiveness: "Повторяемость",
  formalizability: "Формализуемость",
  volume: "Объём",
  dataAvailability: "Доступность данных",
  pain: "Боль",
};

/** Ожидаемая доля экономии часов при автоматизации (для STP-прогноза). */
export const MAX_SAVINGS_RATIO = 0.7;

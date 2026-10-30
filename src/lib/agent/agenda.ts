// ============================================================
// Повестка интервью: фиксированный скелет тем + FollowUp-вопросы
// из комментариев к картам. Дип-дайвы по задачам добавляются
// динамически — когда агент извлекает задачи из ответов.
// ============================================================

export interface Agenda {
  topics: string[];
}

export const TOPIC_ROLE = "Роль и функционал";
export const TOPIC_TASKS = "Основные задачи";
export const TOPIC_HANDOFFS = "Передачи и ожидания";
export const TOPIC_ERRORS = "Ошибки и переделки";
export const TOPIC_GUT = "Решения «на глазок» и шаблонная рутина";
export const TOPIC_SUMMARY = "Резюме и подтверждение";

/**
 * Определение темы: заголовок + главный широкий вопрос.
 * Единый источник для промта (правило про главные вопросы),
 * страховки mainQuestionForTopic и прогресс-бара UI.
 */
export interface TopicDef {
  title: string;
  mainQuestion: string;
}

/** Скелетные темы интервью (порядок фиксирован). */
export const CORE_TOPICS: TopicDef[] = [
  {
    title: TOPIC_ROLE,
    // должность и отдел спрашиваем явно — иначе department в резюме пустует
    mainQuestion: "Кем вы работаете — должность и отдел — и какой у вас функционал в компании?",
  },
  { title: TOPIC_TASKS, mainQuestion: "Какие повторяющиеся задачи занимают больше всего вашего времени?" },
  { title: TOPIC_HANDOFFS, mainQuestion: "Чего или кого вы чаще всего ждёте в работе и что делаете в это время?" },
  { title: TOPIC_ERRORS, mainQuestion: "В каких задачах случаются ошибки или переделки, и из-за чего?" },
  {
    title: TOPIC_GUT,
    // вторая часть — инсайдерская подсказка: сотрудник сам называет кандидата на автоматизацию
    mainQuestion:
      "Какие решения вы принимаете по опыту, без данных? Есть ли рутина с копированием одних и тех же текстов — и что из неё вы бы отдали роботу в первую очередь?",
  },
];

const MAIN_QUESTIONS: Record<string, string> = Object.fromEntries(
  CORE_TOPICS.map((t) => [t.title, t.mainQuestion]),
);

export const DEEP_DIVE_PREFIX = "Дип-дайв задачи: ";
export const FOLLOW_UP_PREFIX = "Дополнительный вопрос: ";

/** Максимум дип-дайвов по задачам. */
export const MAX_DEEP_DIVES = 3;

/** Тема дип-дайва для задачи. */
export function deepDiveTopic(taskTitle: string): string {
  return `${DEEP_DIVE_PREFIX}${taskTitle}`;
}

export function buildAgenda(followUps: string[]): Agenda {
  const topics: string[] = [
    ...CORE_TOPICS.map((t) => t.title),
    ...followUps.map((q) => `${FOLLOW_UP_PREFIX}${q}`),
    TOPIC_SUMMARY,
  ];
  return { topics };
}

/** Главный вопрос любой темы повестки (в т.ч. дип-дайва и follow-up). */
export function mainQuestionForTopic(topic: string): string {
  const known = MAIN_QUESTIONS[topic];
  if (known) return known;
  const dd = topic.startsWith(DEEP_DIVE_PREFIX) ? topic.slice(DEEP_DIVE_PREFIX.length) : null;
  if (dd) return `Опишите по шагам, как выполняется задача «${dd}» — от начала до результата.`;
  if (topic.startsWith(FOLLOW_UP_PREFIX)) return topic.slice(FOLLOW_UP_PREFIX.length);
  return `Расскажите подробнее о теме «${topic}».`;
}

/**
 * Расширение повестки дип-дайвами: новые задачи вставляются сразу
 * после последнего дип-дайва (или после темы «Основные задачи»),
 * чтобы следующей большой темой стал разбор первой задачи.
 *
 * Возвращает новые agenda/coverage, если что-то добавлено.
 */
export function extendAgendaWithTasks(
  agenda: string[],
  coverage: Record<string, "open" | "covered" | "skipped">,
  taskNames: string[],
): { agenda: string[]; coverage: Record<string, "open" | "covered" | "skipped"> } | null {
  const existing = new Set(agenda.map((t) => normalize(t)));
  const existingDives = agenda.filter((t) => t.startsWith(DEEP_DIVE_PREFIX)).length;

  const fresh = taskNames
    .map((n) => n.trim())
    .filter(Boolean)
    .filter((n) => !existing.has(normalize(deepDiveTopic(n))))
    .slice(0, Math.max(0, MAX_DEEP_DIVES - existingDives));

  if (fresh.length === 0) return null;

  // Вставляем после последнего дип-дайва, иначе — после «Основных задач»
  let insertAt = agenda.lastIndexOf(TOPIC_TASKS);
  for (let i = 0; i < agenda.length; i++) {
    if (agenda[i].startsWith(DEEP_DIVE_PREFIX)) insertAt = i;
  }
  const newTopics = fresh.map(deepDiveTopic);
  const nextAgenda = [...agenda.slice(0, insertAt + 1), ...newTopics, ...agenda.slice(insertAt + 1)];
  const nextCoverage = { ...coverage };
  for (const t of newTopics) nextCoverage[t] = "open";

  return { agenda: nextAgenda, coverage: nextCoverage };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

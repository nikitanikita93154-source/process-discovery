import { z } from "zod";

// ============================================================
// Тест 1 — анкета-скрининг (~13 вопросов, 5–7 минут).
// Единый контракт для формы, API и контекста агента Теста 2.
// ============================================================

export const POSITION_OPTIONS = [
  "Бухгалтер",
  "Менеджер по продажам",
  "Руководитель отдела",
  "Специалист ОК (HR)",
  "Аналитик",
  "Логист",
  "Ассистент",
  "Юрист",
  "Инженер",
  "Свой вариант",
] as const;

export const DEPARTMENT_DEFAULTS = [
  "Продажи",
  "Финансы",
  "HR",
  "Операции",
  "IT",
  "Закупки",
  "Юридический",
  "Логистика",
  "Маркетинг",
  "Другое",
] as const;

export const EXPERIENCE_OPTIONS = ["<6 мес", "6–12 мес", "1–3 года", "3+ лет"] as const;

export const FREQUENCY_OPTIONS = [
  "несколько раз в день",
  "раз в день",
  "несколько раз в неделю",
  "раз в неделю",
  "реже",
] as const;

export const DURATION_OPTIONS = ["<5 мин", "5–15 мин", "15–60 мин", ">60 мин"] as const;

export const SYSTEM_OPTIONS = [
  "1С",
  "Excel",
  "CRM",
  "почта",
  "мессенджеры",
  "бумага",
  "другое",
] as const;

export const REGULATION_OPTIONS = ["да", "нет", "не знаю"] as const;

export const WAITING_BEHAVIOR_OPTIONS = [
  "жду, ничего не делаю",
  "переключаюсь на другое",
  "потом переделываю",
] as const;

export const ERROR_CAUSE_OPTIONS = [
  "человеческий фактор",
  "нет данных",
  "устаревшие данные",
  "непонятные требования",
  "чужие ошибки",
  "другое",
] as const;

export const TEMPLATE_FREQ_OPTIONS = ["нет", "иногда", "постоянно"] as const;

export const AI_FEAR_OPTIONS = [
  "заменят",
  "ошибки",
  "слежка",
  "сложно",
  "ничего не боюсь",
] as const;

// --- Блок 0. Паспорт ---
export const passportSchema = z.object({
  position: z.string().trim().min(1, "Укажите должность").max(120),
  positionCustom: z.string().trim().max(120).optional(),
  department: z.string().trim().min(1, "Укажите отдел").max(120),
  experience: z.enum(EXPERIENCE_OPTIONS),
});
export type Passport = z.infer<typeof passportSchema>;

// --- Блок 1. Задачи-кандидаты (повторяемые строки, 1–3) ---
export const taskCandidateSchema = z.object({
  title: z.string().trim().min(3, "Название: минимум 3 символа").max(200),
  frequency: z.enum(FREQUENCY_OPTIONS),
  duration: z.enum(DURATION_OPTIONS),
  systems: z.array(z.enum(SYSTEM_OPTIONS)).min(1, "Выберите хотя бы одну систему"),
  systemsCustom: z.string().trim().max(120).optional(),
  irritation: z.number().int().min(1).max(5),
  regulated: z.enum(REGULATION_OPTIONS),
});
export type TaskCandidate = z.infer<typeof taskCandidateSchema>;

// --- Блок 2. Ожидания ---
export const expectationsSchema = z.object({
  waitingFrequency: z.number().int().min(1).max(5),
  waitingFor: z.string().trim().max(300).optional(),
  behaviorWhileWaiting: z.enum(WAITING_BEHAVIOR_OPTIONS),
});

// --- Блок 3. Ошибки ---
export const mistakesSchema = z.object({
  tasksWithErrors: z.string().trim().max(300).optional(),
  errorFrequency: z.enum(FREQUENCY_OPTIONS),
  causes: z.array(z.enum(ERROR_CAUSE_OPTIONS)),
});

// --- Блок 4. Решения «на глазок» ---
export const gutDecisionsSchema = z.object({
  hasGutDecisions: z.boolean(),
  example: z.string().trim().max(500).optional(),
});

// --- Блок 5. Шаблонные тексты ---
export const templateTextsSchema = z.object({
  frequency: z.enum(TEMPLATE_FREQ_OPTIONS),
  example: z.string().trim().max(500).optional(),
});

// --- Блок 6. Отношение к AI (в скоринг НЕ входит) ---
export const aiAttitudeSchema = z.object({
  attitudeScore: z.number().int().min(1).max(5),
  fears: z.array(z.enum(AI_FEAR_OPTIONS)),
  genieTask: z.string().trim().max(300).optional(),
});

// --- Блок 7. Открытый вопрос ---
export const openQuestionSchema = z.object({
  wasteOfTime: z.string().trim().max(500).optional(),
});

// --- Полная анкета ---
export const test1AnswersSchema = z.object({
  passport: passportSchema,
  tasks: z.array(taskCandidateSchema).min(1, "Добавьте минимум одну задачу").max(3),
  expectations: expectationsSchema.optional(),
  mistakes: mistakesSchema.optional(),
  gutDecisions: gutDecisionsSchema.optional(),
  templateTexts: templateTextsSchema.optional(),
  aiAttitude: aiAttitudeSchema.optional(),
  openQuestion: openQuestionSchema.optional(),
});

export type Test1Answers = z.infer<typeof test1AnswersSchema>;

/**
 * Схема частичных ответов для автосохранения: полностью мягкая —
 * черновик может содержать пустые строки/незаполненные поля (форма шлёт ""
 * для невыбранных select'ов). Строгая валидация выполняется только
 * при завершении теста (test1AnswersSchema, complete=true).
 */
export const test1DraftSchema = z.object({
  passport: z
    .object({
      position: z.string().optional(),
      positionCustom: z.string().optional(),
      department: z.string().optional(),
      experience: z.string().optional(),
    })
    .optional(),
  tasks: z
    .array(
      z.object({
        title: z.string().optional(),
        frequency: z.string().optional(),
        duration: z.string().optional(),
        systems: z.array(z.string()).optional(),
        systemsCustom: z.string().optional(),
        irritation: z.number().optional(),
        regulated: z.string().optional(),
      }),
    )
    .optional(),
  expectations: z
    .object({
      waitingFrequency: z.number().optional(),
      waitingFor: z.string().optional(),
      behaviorWhileWaiting: z.string().optional(),
    })
    .optional(),
  mistakes: z
    .object({
      tasksWithErrors: z.string().optional(),
      errorFrequency: z.string().optional(),
      causes: z.array(z.string()).optional(),
    })
    .optional(),
  gutDecisions: z
    .object({
      hasGutDecisions: z.boolean().optional(),
      example: z.string().optional(),
    })
    .optional(),
  templateTexts: z
    .object({
      frequency: z.string().optional(),
      example: z.string().optional(),
    })
    .optional(),
  aiAttitude: z
    .object({
      attitudeScore: z.number().optional(),
      fears: z.array(z.string()).optional(),
      genieTask: z.string().optional(),
    })
    .optional(),
  openQuestion: z
    .object({
      wasteOfTime: z.string().optional(),
    })
    .optional(),
});

export type Test1Draft = z.infer<typeof test1DraftSchema>;

export const test1PatchSchema = z.object({
  answers: test1DraftSchema,
  complete: z.boolean().optional(),
});

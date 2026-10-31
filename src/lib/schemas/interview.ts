import { z } from "zod";

// ============================================================
// Интервью — AI-агент в формате диалога: строгий JSON-выход
// каждого хода, покрытие тем, резюме. Единый контракт сервера и UI.
// ============================================================

/** Статусы сессии интервью (строковые значения в БД — SQLite без enum). */
export const SESSION_STATUS = {
  IN_PROGRESS: "in_progress",
  AWAITING_CONFIRMATION: "awaiting_confirmation",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
} as const;
export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

/** Активные статусы — сессию можно продолжать. */
export const ACTIVE_SESSION_STATUSES: SessionStatus[] = [
  SESSION_STATUS.IN_PROGRESS,
  SESSION_STATUS.AWAITING_CONFIRMATION,
];

/** Факт, извлечённый из ответов сотрудника. */
export const factSchema = z.object({
  type: z.enum(["task", "step", "actor", "system", "exception", "decision"]),
  name: z.string(),
  actor: z.string().optional(),
  system: z.string().optional(),
  frequency: z.string().optional(),
  volume: z.string().optional(),
  duration: z.string().optional(), // длительность одного прохода, напр. «10–15 минут»
  source: z.string(), // провенанс: "msg#N"
});
export type Fact = z.infer<typeof factSchema>;

/** Строгий JSON-выход одного хода агента. */
export const agentTurnSchema = z.object({
  message: z.string().min(1),
  extracted_facts: z.array(factSchema).default([]),
  coverage_update: z
    .object({
      topic: z.string(),
      status: z.enum(["open", "covered", "skipped"]),
    })
    .optional(),
  next_action: z.enum(["ask", "follow_up", "summarize"]),
  dive_task: z.string().optional(),
});
export type AgentTurn = z.infer<typeof agentTurnSchema>;

/** Состояние покрытия тем сессии. vetoCount — подряд идущие вето на преждевременный summarize. */
export const coverageSchema = z.object({
  topics: z.record(z.string(), z.enum(["open", "covered", "skipped"])),
  followUps: z.number().int().default(0),
  vetoCount: z.number().int().default(0),
});
export type Coverage = z.infer<typeof coverageSchema>;

/** Элемент транскрипта. topic — тема, к которой относится сообщение. */
export const transcriptItemSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
  ts: z.string(),
  topic: z.string().optional(),
});
export type TranscriptItem = z.infer<typeof transcriptItemSchema>;

/** Паспорт сотрудника из интервью (для аналитики). */
export const summaryEmployeeSchema = z.object({
  position: z.string().optional(),
  department: z.string().optional(),
});
export type SummaryEmployee = z.infer<typeof summaryEmployeeSchema>;

/** Итоговое резюме интервью (подтверждается в чате). */
export const interviewSummarySchema = z.object({
  employee: summaryEmployeeSchema.optional(),
  processes: z
    .array(
      z.object({
        name: z.string(),
        steps: z.array(z.string()).default([]),
        actors: z.array(z.string()).default([]),
        systems: z.array(z.string()).default([]),
        // пустая строка = не звучало в беседе (модель не должна выдумывать)
        volume: z.string().default(""),
        frequency: z.string().optional(),
        duration: z.string().optional(),
        pain: z.string().default(""),
        detail_status: z.enum(["discussed", "mentioned"]).optional(),
      }),
    )
    .default([]),
  open_questions: z.array(z.string()).default([]),
});
export type InterviewSummary = z.infer<typeof interviewSummarySchema>;

/** Запрос к POST /api/interview/stream (пустое тело = старт/продолжение сессии). */
export const streamRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  command: z.enum(["STOP"]).optional(), // досрочное завершение → резюме
});

/** Запрос подтверждения резюме. */
export const confirmRequestSchema = z.object({
  sessionId: z.string(),
});


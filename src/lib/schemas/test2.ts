import { z } from "zod";

// ============================================================
// Тест 2 — AI-агент-интервью: строгий JSON-выход каждого хода,
// покрытие тем, резюме. Единый контракт сервера и UI.
// ============================================================

/** Факт, извлечённый из ответов сотрудника. */
export const factSchema = z.object({
  type: z.enum(["task", "step", "actor", "system", "exception"]),
  name: z.string(),
  actor: z.string().optional(),
  system: z.string().optional(),
  frequency: z.string().optional(),
  volume: z.string().optional(),
  source: z.string(), // провенанс: "msg#N" / "test1"
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
  proposed_artifact: z
    .object({
      action: z.enum(["add_step", "add_risk", "add_actor"]),
      name: z.string(),
      details: z.string().optional(),
    })
    .optional(),
  quick_replies: z.array(z.string()).max(5).default([]),
  next_action: z.enum(["ask", "follow_up", "summarize", "confirm"]),
});
export type AgentTurn = z.infer<typeof agentTurnSchema>;

/** Состояние покрытия тем сессии. */
export const coverageSchema = z.object({
  topics: z.record(z.string(), z.enum(["open", "covered", "skipped"])),
  followUps: z.number().int().default(0),
});
export type Coverage = z.infer<typeof coverageSchema>;

/** Элемент транскрипта. */
export const transcriptItemSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
  ts: z.string(),
});
export type TranscriptItem = z.infer<typeof transcriptItemSchema>;

/** Итоговое резюме интервью (экран «Всё верно?»). */
export const interviewSummarySchema = z.object({
  processes: z
    .array(
      z.object({
        name: z.string(),
        steps: z.array(z.string()).default([]),
        actors: z.array(z.string()).default([]),
        systems: z.array(z.string()).default([]),
        volume: z.string(),
        pain: z.string(),
      }),
    )
    .default([]),
  open_questions: z.array(z.string()).default([]),
});
export type InterviewSummary = z.infer<typeof interviewSummarySchema>;

/** Запрос к POST /api/test2/stream (пустое тело = старт/продолжение сессии). */
export const streamRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().trim().min(1).max(2000).optional(),
  command: z.enum(["SKIP", "STOP"]).optional(),
  artifact: z
    .object({
      decision: z.enum(["accept", "edit", "reject"]),
      name: z.string(),
      newName: z.string().optional(),
    })
    .optional(),
});

/** Запрос подтверждения резюме. */
export const confirmRequestSchema = z.object({
  sessionId: z.string(),
  summary: interviewSummarySchema,
});

/** Лимит сессии интервью. */
export const INTERVIEW_LIMIT_MS = 15 * 60 * 1000;

import { z } from "zod";

// ============================================================
// ANALYZE — схемы отчёта скоринга.
// Расчёты детерминированные; LLM только для SWOT и
// оценок-заглушек (с пометкой estimate).
// ============================================================

export const scoredStepSchema = z.object({
  stepId: z.string(),
  stepName: z.string(),
  stage: z.string(),
  actor: z.string(),
  hoursPerYear: z.number().nonnegative(),
  hoursEstimate: z.boolean(), // true = оценка LLM, а не факт
  costPerYear: z.number().nonnegative(),
  automationScore: z.number().int().min(0).max(100),
  breakdown: z.record(z.string(), z.number()),
  suggestTech: z.string(),
  priority: z.number().min(0).max(100),
});

export const stpSchema = z.object({
  currentHours: z.number(),
  forecastHours: z.number(),
  currentCost: z.number(),
  forecastCost: z.number(),
});

export const analysisScoresSchema = z.object({
  steps: z.array(scoredStepSchema),
  totals: z.object({ hoursPerYear: z.number(), costPerYear: z.number() }),
  stp: stpSchema,
  generatedAt: z.string(),
  llmNotes: z.array(z.string()).default([]), // пометки об estimate/ошибках
});

export const swotSchema = z.object({
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
  threats: z.array(z.string()).default([]),
});

/** LLM-схема оценок часов для шагов без фактических данных. */
export const hoursEstimateSchema = z.object({
  estimates: z
    .array(
      z.object({
        stepName: z.string(),
        hoursPerYear: z.number().min(0).max(20000),
      }),
    )
    .default([]),
});

export type ScoredStep = z.infer<typeof scoredStepSchema>;
export type Stp = z.infer<typeof stpSchema>;
export type AnalysisScores = z.infer<typeof analysisScoresSchema>;
export type Swot = z.infer<typeof swotSchema>;

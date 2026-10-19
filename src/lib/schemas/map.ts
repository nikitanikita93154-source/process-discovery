import { z } from "zod";

// ============================================================
// Карта процесса (ProcessMap.json): stages → steps с цитатами,
// рисками и решениями. Единый контракт BUILD/канваса/анализа.
// ============================================================

export const mapCitationSchema = z.object({
  sourceId: z.string(),
  ref: z.string(),
});

export const mapRiskSchema = z.object({
  severity: z.string(), // низкая | средняя | высокая
  likelihood: z.string(),
  mitigation: z.string(),
  source: z.string(),
});

export const mapDecisionSchema = z.object({
  condition: z.string(),
  to: z.string(), // название шага, к которому ведёт условие
});

export const mapStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  actor: z.string(),
  system: z.string(),
  trigger: z.string().optional(),
  decisions: z.array(mapDecisionSchema).default([]),
  risks: z.array(mapRiskSchema).default([]),
  citations: z.array(mapCitationSchema).default([]),
});

export const mapStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(mapStepSchema).default([]),
});

export const processMapJsonSchema = z.object({
  goal: z.string().optional(), // чек-лист полноты
  owner: z.string().optional(),
  kpi: z.string().optional(),
  endState: z.string().optional(),
  stages: z.array(mapStageSchema).default([]),
});

export type MapCitation = z.infer<typeof mapCitationSchema>;
export type MapRisk = z.infer<typeof mapRiskSchema>;
export type MapDecision = z.infer<typeof mapDecisionSchema>;
export type MapStep = z.infer<typeof mapStepSchema>;
export type MapStage = z.infer<typeof mapStageSchema>;
export type ProcessMapJson = z.infer<typeof processMapJsonSchema>;

/** Схема строгого выхода LLM при BUILD (без служебных id — они генерируются после). */
export const llmMapSchema = z.object({
  stages: z
    .array(
      z.object({
        name: z.string(),
        steps: z
          .array(
            z.object({
              name: z.string(),
              actor: z.string(),
              system: z.string(),
              trigger: z.string().optional(),
              decisions: z
                .array(z.object({ condition: z.string(), to: z.string() }))
                .default([]),
              risks: z
                .array(
                  z.object({
                    severity: z.string(),
                    likelihood: z.string(),
                    mitigation: z.string(),
                    source: z.string(),
                  }),
                )
                .default([]),
              citations: z
                .array(z.object({ sourceId: z.string(), ref: z.string() }))
                .default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
export type LlmMap = z.infer<typeof llmMapSchema>;

/** Пост-обработка выхода LLM: id, фильтрация битых sourceId, дефолты. */
export function normalizeLlmMap(llm: LlmMap, validSourceIds: Set<string>): ProcessMapJson {
  const stages = llm.stages.map((stage, i) => ({
    id: `stage-${i + 1}`,
    name: stage.name,
    steps: stage.steps.map((step, j) => ({
      id: `step-${i + 1}-${j + 1}`,
      name: step.name,
      actor: step.actor,
      system: step.system,
      trigger: step.trigger,
      decisions: step.decisions,
      risks: step.risks,
      citations: step.citations.filter((c) => validSourceIds.has(c.sourceId)),
    })),
  }));
  return { stages };
}

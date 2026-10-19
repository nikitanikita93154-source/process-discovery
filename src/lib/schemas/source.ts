import { z } from "zod";

// ============================================================
// Единый формат распарсенного источника (Source.parsedJson)
// для интервью и документов. Используется BUILD-ом карты.
// ============================================================

export const parsedSourceSchema = z.object({
  candidateSteps: z
    .array(
      z.object({
        name: z.string(),
        actor: z.string().optional(),
        system: z.string().optional(),
        frequency: z.string().optional(),
        volume: z.string().optional(),
        source: z.string().optional(), // провенанс
      }),
    )
    .default([]),
  actors: z.array(z.string()).default([]),
  rules: z
    .array(
      z.object({
        text: z.string(),
        source: z.string().optional(),
      }),
    )
    .default([]),
  exceptions: z.array(z.string()).default([]),
  citations: z
    .array(
      z.object({
        sourceId: z.string().optional(),
        ref: z.string(), // «стр. 3», «тема Дип-дайв задачи №1»
      }),
    )
    .default([]),
});

export type ParsedSource = z.infer<typeof parsedSourceSchema>;

/** LLM-схема извлечения из документа (сырой выход, до нормализации). */
export const docExtractionSchema = z.object({
  candidate_steps: z
    .array(
      z.object({
        name: z.string(),
        actor: z.string().optional(),
        system: z.string().optional(),
        frequency: z.string().optional(),
        volume: z.string().optional(),
        ref: z.string().optional(), // раздел/страница
      }),
    )
    .default([]),
  actors: z.array(z.string()).default([]),
  rules: z
    .array(
      z.object({
        text: z.string(),
        ref: z.string().optional(),
      }),
    )
    .default([]),
  exceptions: z.array(z.string()).default([]),
  citations: z.array(z.object({ ref: z.string() })).default([]),
});
export type DocExtraction = z.infer<typeof docExtractionSchema>;

/** Нормализация выхода LLM → ParsedSource. */
export function docExtractionToParsedSource(ext: DocExtraction): ParsedSource {
  return {
    candidateSteps: ext.candidate_steps.map((s) => ({
      name: s.name,
      actor: s.actor,
      system: s.system,
      frequency: s.frequency,
      volume: s.volume,
      source: s.ref,
    })),
    actors: ext.actors,
    rules: ext.rules.map((r) => ({ text: r.text, source: r.ref })),
    exceptions: ext.exceptions,
    citations: ext.citations,
  };
}

/** LLM-схема детекции конфликтов «документ vs интервью». */
export const conflictDetectionSchema = z.object({
  contradictions: z
    .array(
      z.object({
        docRule: z.string(),
        interviewFact: z.string(),
        description: z.string(),
      }),
    )
    .default([]),
});
export type ConflictDetection = z.infer<typeof conflictDetectionSchema>;

/** Извлечение фактов интервью → ParsedSource (провенанс msg#N сохраняется). */
export function factsToParsedSource(input: {
  facts: { type: string; name: string; actor?: string; system?: string; frequency?: string; volume?: string; source?: string }[];
  summary: { processes: { name: string; steps: string[]; actors: string[]; systems: string[]; volume: string; pain: string }[]; open_questions: string[] };
  citationRef: string;
}): ParsedSource {
  const { facts, summary, citationRef } = input;
  const steps = facts
    .filter((f) => f.type === "step" || f.type === "task")
    .map((f) => ({
      name: f.name,
      actor: f.actor,
      system: f.system,
      frequency: f.frequency,
      volume: f.volume,
      source: f.source,
    }));
  const actors = Array.from(
    new Set([...facts.filter((f) => f.type === "actor").map((f) => f.name), ...summary.processes.flatMap((p) => p.actors)]),
  );
  const systems = Array.from(
    new Set([...facts.filter((f) => f.type === "system").map((f) => f.name), ...summary.processes.flatMap((p) => p.systems)]),
  );
  const exceptions = facts.filter((f) => f.type === "exception").map((f) => f.name);
  const rules = exceptions.map((text) => ({ text, source: citationRef }));
  return {
    candidateSteps: steps,
    actors,
    rules,
    exceptions,
    citations: [
      { ref: citationRef },
      ...summary.processes.map((p) => ({ ref: `${p.name}: ${p.steps.length} шагов` })),
    ],
  };
}

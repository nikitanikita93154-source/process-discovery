import { z } from "zod";
import { factSchema, interviewSummarySchema } from "@/lib/schemas/interview";

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
        duration: z.string().optional(), // длительность одного прохода
        source: z.string().optional(), // провенанс
      }),
    )
    .default([]),
  actors: z.array(z.string()).default([]),
  systems: z.array(z.string()).default([]),
  /** Решения «на глазок» (факты type=decision) — не шаги процесса. */
  gutDecisions: z.array(z.string()).default([]),
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
  /** Встроенные данные интервью: кто опрошен, резюме, факты и связи процессов. */
  interview: z
    .object({
      sessionId: z.string().optional(),
      employeeName: z.string().optional(),
      summary: interviewSummarySchema.optional(),
      facts: z.array(factSchema).optional(),
      /** Семантические связи: процесс резюме → проект/кандидат (по смыслу, не по строкам). */
      processLinks: z
        .array(
          z.object({
            process: z.string(),
            projectId: z.string().optional(),
            candidateId: z.string().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
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
    systems: Array.from(
      new Set(ext.candidate_steps.map((s) => s.system).filter((s): s is string => Boolean(s))),
    ),
    gutDecisions: [], // из документов решения «на глазок» не извлекаются
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

/** Извлечение фактов интервью → ParsedSource (провенанс msg#N сохраняется).
 *  Шаги из подтверждённого сотрудником резюме тоже попадают в candidateSteps —
 *  с дедупликацией против step-фактов (по нормализованному названию).
 *  Решения «на глазок» (type=decision) уходят в gutDecisions, НЕ в шаги. */
export function factsToParsedSource(input: {
  facts: { type: string; name: string; actor?: string; system?: string; frequency?: string; volume?: string; duration?: string; source?: string }[];
  summary: { processes: { name: string; steps: string[]; actors: string[]; systems: string[]; volume?: string; pain?: string }[]; open_questions: string[] };
  citationRef: string;
}): ParsedSource {
  const { facts, summary, citationRef } = input;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  const candidateSteps = facts
    .filter((f) => f.type === "step" || f.type === "task")
    .map((f) => ({
      name: f.name,
      actor: f.actor,
      system: f.system,
      frequency: f.frequency,
      volume: f.volume,
      duration: f.duration,
      source: f.source,
    }));
  const gutDecisions = facts.filter((f) => f.type === "decision").map((f) => f.name);

  // Шаги из резюме (подтверждены сотрудником) — сверх фактов, без дублей
  const knownSteps = new Set(candidateSteps.map((s) => norm(s.name)));
  const summarySteps = summary.processes.flatMap((p) =>
    p.steps
      .map((st) => st.trim())
      .filter(Boolean)
      .filter((st) => {
        const key = norm(st);
        if (knownSteps.has(key)) return false;
        knownSteps.add(key);
        return true;
      })
      .map((st) => ({ name: st, source: `резюме: ${p.name}` })),
  );

  const actors = Array.from(
    new Set([...facts.filter((f) => f.type === "actor").map((f) => f.name), ...summary.processes.flatMap((p) => p.actors)]),
  );
  const systems = Array.from(
    new Set([...facts.filter((f) => f.type === "system").map((f) => f.name), ...summary.processes.flatMap((p) => p.systems)]),
  );
  const exceptions = facts.filter((f) => f.type === "exception").map((f) => f.name);
  const rules = exceptions.map((text) => ({ text, source: citationRef }));
  return {
    candidateSteps: [...candidateSteps, ...summarySteps],
    actors,
    systems,
    gutDecisions,
    rules,
    exceptions,
    citations: [
      { ref: citationRef },
      ...summary.processes.map((p) => ({ ref: `резюме: ${p.name}` })),
    ],
  };
}

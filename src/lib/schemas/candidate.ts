import { z } from "zod";

// ============================================================
// Найденные процессы (ProcessCandidate): схемы LLM-детекции
// и API. Кандидат = процесс, обнаруженный в интервью/документах,
// ожидающий решения владельца.
// ============================================================

/** Запись-доказательство кандидата: кто и что упомянул. */
export const evidenceItemSchema = z.object({
  who: z.string(), // «Марина Ким (интервью)» / «Документ „Регламент…"»
  what: z.string(), // задача/факт
  ref: z.string().optional(), // частота/раздел/тема
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/** Дедуп-слияние доказательств: по (who, what), новые в конец. */
export function mergeEvidence(existing: EvidenceItem[], additions: EvidenceItem[]): EvidenceItem[] {
  const seen = new Set(existing.map((e) => `${e.who}::${e.what}`.toLowerCase()));
  const merged = [...existing];
  for (const a of additions) {
    const key = `${a.who}::${a.what}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(a);
  }
  return merged;
}

/** LLM-схема маршрутизации резюме интервью по проектам организации. */
export const routingSchema = z.object({
  attachToProjectId: z.string().nullable(), // id существующего проекта или null
  matchReason: z.string().optional(),
  /** Для каждого процесса резюме: совпадение с проектом или существующим кандидатом. */
  matches: z
    .array(
      z.object({
        process: z.string(),
        projectId: z.string().nullable().optional(),
        candidateId: z.string().nullable().optional(),
      }),
    )
    .default([]),
  newCandidates: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().max(500).optional(),
        reason: z.string().max(300).optional(),
      }),
    )
    .default([]),
});
export type Routing = z.infer<typeof routingSchema>;

/** LLM-схема детекции процесса в документе. */
export const docProcessDetectionSchema = z.object({
  processNames: z.array(z.string()).default([]),
});
export type DocProcessDetection = z.infer<typeof docProcessDetectionSchema>;

/** Ответ API списка кандидатов. */
export const candidateRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  origin: z.string(),
  evidence: z.array(evidenceItemSchema).default([]),
  createdAt: z.string(),
});
export type CandidateRow = z.infer<typeof candidateRowSchema>;

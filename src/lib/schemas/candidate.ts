import { z } from "zod";

// ============================================================
// Найденные процессы (ProcessCandidate): схемы LLM-детекции
// и API. Кандидат = процесс, обнаруженный в интервью/анкетах
// Т1/документах, ожидающий решения владельца.
// ============================================================

/** Запись-доказательство кандидата: кто и что упомянул. */
export const evidenceItemSchema = z.object({
  who: z.string(), // «Марина Ким (Тест 1)» / «Документ „Регламент…"»
  what: z.string(), // задача/факт
  ref: z.string().optional(), // частота/раздел/тема
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/** LLM-схема маршрутизации резюме интервью по проектам организации. */
export const routingSchema = z.object({
  attachToProjectId: z.string().nullable(), // id существующего проекта или null
  matchReason: z.string().optional(),
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

/** LLM-схема кластеризации задач Теста 1. */
export const t1ClusteringSchema = z.object({
  clusters: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().max(500).optional(),
        taskTitles: z.array(z.string()).default([]), // исходные названия задач, вошедшие в кластер
        reason: z.string().max(300).optional(),
      }),
    )
    .default([]),
});
export type T1Clustering = z.infer<typeof t1ClusteringSchema>;

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

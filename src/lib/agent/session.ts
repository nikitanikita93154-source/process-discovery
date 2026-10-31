import {
  coverageSchema,
  factSchema,
  interviewSummarySchema,
  transcriptItemSchema,
} from "@/lib/schemas/interview";
import { TOPIC_SUMMARY } from "@/lib/agent/agenda";
import { currentTopicIndex, type InterviewState } from "@/lib/agent/interview";

// ============================================================
// Восстановление состояния интервью из строки БД и snapshot
// сессии для SSE/UI. Единая точка вместо копий в роутах.
// ============================================================

/** Минимальная строка InterviewSession, достаточная для восстановления состояния. */
export interface InterviewSessionRow {
  id: string;
  userId: string;
  status: string;
  startedAt: Date;
  agenda: unknown;
  coverage: unknown;
  transcript: unknown;
  facts: unknown;
  summary: unknown;
}

/** InterviewState из строки БД с zod-валидацией JSON-полей. */
export function loadInterviewState(row: InterviewSessionRow, employeeName: string): InterviewState {
  return {
    sessionId: row.id,
    userId: row.userId,
    employeeName,
    status: row.status,
    startedAt: row.startedAt,
    agenda: (row.agenda as string[]) ?? [],
    coverage: coverageSchema.parse(row.coverage ?? { topics: {}, followUps: 0 }),
    transcript: transcriptItemSchema.array().parse(row.transcript ?? []),
    facts: factSchema.array().parse(row.facts ?? []),
    summary: row.summary ? interviewSummarySchema.parse(row.summary) : null,
  };
}

/** Snapshot прогресса сессии: SSE-событие session и GET /api/interview/session. */
export function sessionSnapshot(state: InterviewState) {
  const idx = currentTopicIndex(state);
  return {
    sessionId: state.sessionId,
    status: state.status,
    agenda: state.agenda,
    coverage: state.coverage,
    currentTopic: idx >= 0 ? state.agenda[idx] : TOPIC_SUMMARY,
    topicNumber: Math.min(idx + 1, state.agenda.length),
    topicsTotal: state.agenda.length,
    elapsedMs: Date.now() - new Date(state.startedAt).getTime(),
  };
}

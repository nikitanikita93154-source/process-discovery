import { db } from "@/lib/db";
import { factsToParsedSource } from "@/lib/schemas/source";
import type { InterviewState } from "@/lib/agent/interview";
import { routeInterview } from "@/lib/agent/routing";
import type { InterviewSummary } from "@/lib/schemas/test2";

/**
 * Финализация интервью: статус completed, факты → Source(type: interview).
 * Проект определяется LLM-маршрутизацией (совпадение процесса с проектом
 * организации; новый процесс → ProcessCandidate). FollowUp-вопросы из
 * повестки помечаются asked.
 */
export async function completeInterview(
  state: InterviewState,
  _projectId?: string | null,
): Promise<{ projectId: string; candidatesCreated?: number }> {
  const t2 = await db.interviewSession.findUnique({where: { id: state.sessionId }});
  if (t2?.status === "completed") throw new Error("Интервью уже завершено");
  const employee = await db.user.findUnique({ where: { id: state.userId } });
  const orgId = employee?.orgId;
  if (!orgId) throw new Error("Пользователь не найден");

  const summary: InterviewSummary = state.summary ?? { processes: [], open_questions: [] };
  const route = await routeInterview(orgId, state.userId, state.employeeName, summary);
  const project = await db.project.findFirst({ where: { id: route.projectId, orgId } });
  if (!project) throw new Error("Проект маршрутизации не найден");

  const parsed = factsToParsedSource({
    facts: state.facts,
    summary,
    citationRef: `Интервью: ${state.employeeName}`,
  });

  await db.source.create({
    data: {
      projectId: project.id,
      type: "interview",
      name: `Интервью — ${state.employeeName}`,
      status: "parsed",
      parsedJson: { ...parsed, interview: { summary: state.summary, facts: state.facts } },
    },
  });

  // FollowUp-вопросы, вошедшие в повестку, помечаем как заданные
  const followUpTopics = state.agenda.filter((t) => t.startsWith("Дополнительный вопрос: "));
  for (const topic of followUpTopics) {
    const text = topic.replace("Дополнительный вопрос: ", "");
    await db.followUpQuestion.updateMany({ where: { project: { orgId }, text, status: "open" }, data: { status: "asked" } });
  }

  await db.interviewSession.update({
    where: { id: state.sessionId },
    data: { status: "completed", endedAt: new Date(), projectId: project.id },
  });

  return { projectId: project.id, candidatesCreated: route.createdCandidates };
}

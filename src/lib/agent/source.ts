import { db } from "@/lib/db";
import { factsToParsedSource } from "@/lib/schemas/source";
import type { InterviewState } from "@/lib/agent/interview";

/**
 * Финализация интервью: статус completed, факты → Source(type: interview)
 * в проекте организации (последний проект; если проектов нет — создаётся новый).
 * FollowUp-вопросы из повестки помечаются asked.
 */
export async function completeInterview(
  state: InterviewState,
  projectId?: string | null,
): Promise<{ projectId: string }> {
  const employee = await db.user.findUnique({ where: { id: state.userId } });
  const orgId = employee?.orgId;
  if (!orgId) throw new Error("Пользователь не найден");

  let project = projectId
    ? await db.project.findFirst({ where: { id: projectId, orgId } })
    : await db.project.findFirst({ where: { orgId }, orderBy: { createdAt: "desc" } });

  if (!project) {
    project = await db.project.create({
      data: {
        orgId,
        title: `Процесс: ${state.employeeName}`,
        description: `Автоматически создан по итогам интервью ${state.employeeName}`,
        status: "capturing",
      },
    });
  }

  const parsed = factsToParsedSource({
    facts: state.facts,
    summary: state.summary ?? { processes: [], open_questions: [] },
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
    data: { status: "completed", endedAt: new Date() },
  });

  return { projectId: project.id };
}

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { factsToParsedSource } from "@/lib/schemas/source";
import { SESSION_STATUS, type InterviewSummary } from "@/lib/schemas/interview";
import type { InterviewState } from "@/lib/agent/interview";
import { routeInterview } from "@/lib/agent/routing";
import { FOLLOW_UP_PREFIX } from "@/lib/agent/agenda";

/**
 * Идемпотентное добавление участников проекта: сотрудник автоматически
 * становится участником, если из его интервью берётся процесс проекта.
 */
export async function ensureProjectParticipants(
  tx: Prisma.TransactionClient,
  pairs: { projectId: string; userId: string }[],
): Promise<void> {
  for (const p of pairs) {
    const exists = await tx.projectParticipant.findFirst({ where: p });
    if (!exists) await tx.projectParticipant.create({ data: p });
  }
}

/**
 * Финализация интервью: статус completed, факты → Source(type: interview).
 * Проект определяется LLM-маршрутизацией (совпадение процесса с проектом
 * организации; новый процесс → ProcessCandidate). FollowUp-вопросы из
 * повестки помечаются asked.
 *
 * Идемпотентность: признак полной финализации — completed + projectId
 * (projectId выставляется последним, внутри транзакции с записью Source).
 */
export async function completeInterview(
  state: InterviewState,
): Promise<{ projectId: string; candidatesCreated?: number }> {
  // Быстрый путь: сессия уже полностью финализирована
  const current = await db.interviewSession.findUnique({ where: { id: state.sessionId } });
  if (current?.status === SESSION_STATUS.COMPLETED && current.projectId) {
    return { projectId: current.projectId };
  }

  // Атомарная блокировка от параллельного запуска (двойной клик / ретрай):
  // count=1 получает ровно один вызов, остальные идут дальше как ретраи —
  // дубликат Source отсекается проверкой projectId внутри транзакции
  await db.interviewSession.updateMany({
    where: { id: state.sessionId, status: { not: SESSION_STATUS.COMPLETED } },
    data: { status: SESSION_STATUS.COMPLETED, endedAt: new Date() },
  });

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
  await db.$transaction(async (tx) => {
    // Другой запуск уже записал Source и выставил projectId — не дублируем
    const fresh = await tx.interviewSession.findUnique({
      where: { id: state.sessionId },
      select: { projectId: true },
    });
    if (fresh?.projectId) return;

    await tx.source.create({
      data: {
        projectId: project.id,
        type: "interview",
        name: `Интервью — ${state.employeeName}`,
        status: "parsed",
        parsedJson: {
          ...parsed,
          interview: {
            sessionId: state.sessionId,
            employeeName: state.employeeName,
            summary: state.summary,
            facts: state.facts,
            processLinks: route.processLinks,
          },
        },
      },
    });

    // FollowUp-вопросы, вошедшие в повестку, помечаем как заданные
    const followUpTopics = state.agenda.filter((t) => t.startsWith(FOLLOW_UP_PREFIX));
    for (const topic of followUpTopics) {
      const text = topic.slice(FOLLOW_UP_PREFIX.length);
      await tx.followUpQuestion.updateMany({ where: { project: { orgId }, text, status: "open" }, data: { status: "asked" } });
    }

    // Сотрудник — участник проектов, куда легли его процессы:
    // сам источник + семантические связи processLinks
    const participantProjects = new Set<string>([project.id]);
    for (const l of route.processLinks) {
      if (l.projectId) participantProjects.add(l.projectId);
    }
    await ensureProjectParticipants(
      tx,
      [...participantProjects].map((projectId) => ({ projectId, userId: state.userId })),
    );

    await tx.interviewSession.update({
      where: { id: state.sessionId },
      data: { status: SESSION_STATUS.COMPLETED, endedAt: new Date(), projectId: project.id },
    });
  });
  return { projectId: project.id, candidatesCreated: route.createdCandidates };
}

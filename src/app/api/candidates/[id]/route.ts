import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ApiError, parseBody } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const paramsSchema = z.object({ id: z.string() });
const bodySchema = z.object({ action: z.enum(["accept", "dismiss"]) });

/**
 * POST /api/candidates/[id] — решение по кандидату:
 * accept → создать проект (origin=auto_*), dismiss → отклонить.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = paramsSchema.parse(await params);
    const { action } = await parseBody(req, bodySchema);

    const candidate = await db.processCandidate.findFirst({
      where: { id, orgId: owner.orgId, status: "proposed" },
    });
    if (!candidate) throw new ApiError(404, "Кандидат не найден");

    if (action === "dismiss") {
      await db.processCandidate.update({ where: { id }, data: { status: "dismissed" } });
      return NextResponse.json({ ok: true, dismissed: true });
    }

    const originMap: Record<string, string> = {
      interview: "auto_interview",
      document: "auto_document",
    };
    const originLabel = candidate.origin === "interview" ? "интервью" : "документе";
    const evidence = candidate.evidence as { who?: string; what?: string }[];
    const whoMentioned = evidence.map((e) => e.who).filter(Boolean).slice(0, 5).join(", ");
    const project = await db.project.create({
      data: {
        orgId: owner.orgId,
        title: candidate.title,
        description: candidate.description,
        status: "capturing",
        origin: originMap[candidate.origin] ?? "manual",
        autoReason: `Обнаружен в ${originLabel}${whoMentioned ? ` (${whoMentioned})` : ""}`,
      },
    });
    await db.processCandidate.update({ where: { id }, data: { status: "accepted" } });

    // Миграция семантических связей: интервью-источники, ссылающиеся на этого
    // кандидата, перепривязываются к новому проекту (для отображения сотрудников).
    // Опрошенные сотрудники автоматически становятся участниками проекта.
    const orgSources = await db.source.findMany({
      where: { project: { orgId: owner.orgId }, type: "interview" },
      select: { id: true, name: true, parsedJson: true },
    });
    const participantUserIds = new Set<string>();
    for (const s of orgSources) {
      const pj = s.parsedJson as {
        interview?: {
          sessionId?: string;
          employeeName?: string;
          processLinks?: { process: string; projectId?: string; candidateId?: string }[];
        };
      } | null;
      if (!pj?.interview) continue;
      const links = pj.interview.processLinks;
      if (!links || !links.some((l) => l.candidateId === id)) continue;
      pj.interview.processLinks = links.map((l) =>
        l.candidateId === id ? { process: l.process, projectId: project.id } : l,
      );
      await db.source.update({
        where: { id: s.id },
        data: { parsedJson: JSON.parse(JSON.stringify(pj)) },
      });
      // userId: из сессии интервью надёжнее; fallback — по имени в организации
      let userId: string | undefined;
      if (pj.interview.sessionId) {
        const session = await db.interviewSession.findUnique({
          where: { id: pj.interview.sessionId },
          select: { userId: true },
        });
        userId = session?.userId;
      }
      if (!userId && pj.interview.employeeName) {
        const user = await db.user.findFirst({
          where: { orgId: owner.orgId, name: pj.interview.employeeName },
          select: { id: true },
        });
        userId = user?.id;
      }
      if (userId) participantUserIds.add(userId);
    }
    for (const userId of participantUserIds) {
      const exists = await db.projectParticipant.findFirst({ where: { projectId: project.id, userId } });
      if (!exists) await db.projectParticipant.create({ data: { projectId: project.id, userId } });
    }

    return NextResponse.json({ ok: true, projectId: project.id });
  });
}

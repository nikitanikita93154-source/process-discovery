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
      t1: "auto_t1",
      document: "auto_document",
    };
    const evidence = candidate.evidence as { who?: string; what?: string }[];
    const whoMentioned = evidence.map((e) => e.who).filter(Boolean).slice(0, 5).join(", ");
    const project = await db.project.create({
      data: {
        orgId: owner.orgId,
        title: candidate.title,
        description: candidate.description,
        status: "capturing",
        origin: originMap[candidate.origin] ?? "manual",
        autoReason: `Обнаружен в ${candidate.origin === "t1" ? "анкетах Теста 1" : candidate.origin === "interview" ? "интервью" : "документе"}${whoMentioned ? ` (${whoMentioned})` : ""}`,
      },
    });
    await db.processCandidate.update({ where: { id }, data: { status: "accepted" } });

    return NextResponse.json({ ok: true, projectId: project.id });
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const paramsSchema = z.object({ id: z.string() });
const bodySchema = z.object({ text: z.string().trim().min(3).max(500).optional() });

/**
 * POST /api/comments/[id]/to-followup — превратить комментарий в вопрос
 * для следующего интервью (FollowUpQuestion проекта).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = paramsSchema.parse(await params);
    const { text } = await parseBody(req, bodySchema);

    const comment = await db.comment.findFirst({
      where: { id, map: { project: { orgId: owner.orgId } } },
      include: { map: { select: { projectId: true } } },
    });
    if (!comment) throw new ApiError(404, "Комментарий не найден");

    const followUp = await db.followUpQuestion.create({
      data: {
        projectId: comment.map.projectId,
        text: text ?? comment.body,
        status: "open",
        sourceCommentId: comment.id,
      },
    });
    return NextResponse.json({ id: followUp.id });
  });
}

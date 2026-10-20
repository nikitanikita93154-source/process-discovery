import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiOwner, requireProject } from "@/lib/guards";

const bodySchema = z.object({
  userIds: z.array(z.string().min(1)).max(50),
});

/**
 * POST /api/projects/[id]/participants — задать список участников проекта
 * целиком (set-семантика). Только владелец; все пользователи — из этой же
 * организации, иначе 404 (изоляция).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = await params;
    const project = await requireProject(id, owner.orgId);
    const { userIds } = await parseBody(req, bodySchema);

    if (userIds.length > 0) {
      const validUsers = await db.user.findMany({
        where: { id: { in: userIds }, orgId: owner.orgId },
        select: { id: true },
      });
      if (validUsers.length !== userIds.length) {
        throw new ApiError(404, "Часть сотрудников не найдена в вашей организации");
      }
    }

    // set-семантика: заменить список
    await db.$transaction([
      db.projectParticipant.deleteMany({ where: { projectId: project.id } }),
      ...userIds.map((userId) =>
        db.projectParticipant.create({ data: { projectId: project.id, userId } }),
      ),
    ]);

    return NextResponse.json({ ok: true, count: userIds.length });
  });
}

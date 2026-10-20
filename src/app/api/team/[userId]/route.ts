import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, ApiError } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";
import { z } from "zod";

const paramsSchema = z.object({ userId: z.string().min(1) });

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { userId } = paramsSchema.parse(await params);

    const target = await db.user.findFirst({ where: { id: userId, orgId: owner.orgId } });
    if (!target) throw new ApiError(404, "Сотрудник не найден");
    if (target.role === "OWNER") throw new ApiError(403, "Нельзя удалить владельца организации");

    // Каскадно чистим связанные данные сотрудника
    await db.$transaction([
      db.interviewSession.deleteMany({ where: { userId } }),
      db.comment.deleteMany({ where: { authorId: userId } }),
      db.projectParticipant.deleteMany({ where: { userId } }),
      db.test1Session.deleteMany({ where: { userId } }),
      db.user.delete({ where: { id: userId } }),
    ]);

    return NextResponse.json({ ok: true });
  });
}

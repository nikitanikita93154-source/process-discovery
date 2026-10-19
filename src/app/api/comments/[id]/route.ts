import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const paramsSchema = z.object({ id: z.string() });

/** PATCH /api/comments/[id] — отметить комментарий решённым. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = paramsSchema.parse(await params);
    const body = await parseBody(req, z.object({ resolved: z.boolean() }));

    const comment = await db.comment.findFirst({
      where: { id, map: { project: { orgId: owner.orgId } } },
    });
    if (!comment) throw new ApiError(404, "Комментарий не найден");

    await db.comment.update({ where: { id }, data: { resolved: body.resolved } });
    return NextResponse.json({ ok: true });
  });
}

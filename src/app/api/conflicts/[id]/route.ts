import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ApiError, parseBody } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({ resolved: z.boolean().optional() });

/** PATCH /api/conflicts/[id] — отметить конфликт разобранным (или вернуть). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = paramsSchema.parse(await params);
    const body = await parseBody(req, bodySchema);

    const conflict = await db.conflict.findFirst({
      where: { id, project: { orgId: owner.orgId } },
    });
    if (!conflict) throw new ApiError(404, "Конфликт не найден");

    await db.conflict.update({
      where: { id },
      data: { resolved: body.resolved ?? true },
    });
    return NextResponse.json({ ok: true });
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const createSchema = z.object({
  nodeId: z.string().min(1),
  body: z.string().trim().min(1, "Пустой комментарий").max(2000),
  parentId: z.string().optional(),
});

async function mapInOrg(mapId: string, orgId: string) {
  const map = await db.processMap.findFirst({
    where: { id: mapId, project: { orgId } },
  });
  if (!map) throw new ApiError(404, "Карта не найдена");
  return map;
}

/** GET /api/maps/[id]/comments — дерево комментариев карты. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = z.object({ id: z.string() }).parse(await params);
    await mapInOrg(id, owner.orgId);

    const comments = await db.comment.findMany({
      where: { mapId: id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true, role: true } } },
    });
    return NextResponse.json({ comments });
  });
}

/** POST /api/maps/[id]/comments — комментарий/ответ, привязан к nodeId. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = z.object({ id: z.string() }).parse(await params);
    await mapInOrg(id, owner.orgId);
    const data = await parseBody(req, createSchema);

    if (data.parentId) {
      const parent = await db.comment.findFirst({ where: { id: data.parentId, mapId: id } });
      if (!parent) throw new ApiError(404, "Родительский комментарий не найден");
    }

    const comment = await db.comment.create({
      data: { mapId: id, nodeId: data.nodeId, authorId: owner.id, body: data.body, parentId: data.parentId },
    });
    return NextResponse.json({ id: comment.id });
  });
}

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ApiError, parseBody } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({ resolved: z.boolean() });

async function sourceInOrg(sourceId: string, orgId: string) {
  const source = await db.source.findFirst({
    where: { id: sourceId, project: { orgId } },
  });
  if (!source) throw new ApiError(404, "Источник не найден");
  return source;
}

/** DELETE /api/sources/[id] — удалить источник (и файл загрузки). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = paramsSchema.parse(await params);
    const source = await sourceInOrg(id, owner.orgId);

    await db.$transaction([
      db.conflict.deleteMany({ where: { docSourceId: id } }),
      db.conflict.deleteMany({ where: { interviewSourceId: id } }),
      db.source.delete({ where: { id } }),
    ]);
    if (source.fileRef) {
      await fs.rm(path.join(process.cwd(), "uploads", path.basename(source.fileRef)), { force: true });
    }
    return NextResponse.json({ ok: true });
  });
}

/** PATCH /api/sources/[id] — переименовать / сменить статус. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = paramsSchema.parse(await params);
    const body = await parseBody(req, bodySchema);
    await sourceInOrg(id, owner.orgId);
    await db.source.update({ where: { id }, data: { status: body.resolved ? "parsed" : "pending" } });
    return NextResponse.json({ ok: true });
  });
}

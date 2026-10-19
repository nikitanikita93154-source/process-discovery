import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireApiOwner, requireProject } from "@/lib/guards";
import { processMapJsonSchema } from "@/lib/schemas/map";

const bodySchema = z.object({
  json: processMapJsonSchema,
  /** author=ai — подтверждение rebuild поверх человеческих правок. */
  acceptAi: z.boolean().optional(),
});

/**
 * POST /api/projects/[id]/map/save — сохранить карту новой версией.
 * Правки человека → author: human; подтверждение AI-rebuild → author: ai.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = await params;
    const project = await requireProject(id, owner.orgId);
    const { json, acceptAi } = await parseBody(req, bodySchema);

    const latest = await db.processMap.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
    });

    const map = await db.processMap.create({
      data: {
        projectId: project.id,
        version: (latest?.version ?? 0) + 1,
        json,
        author: acceptAi ? "ai" : "human",
      },
    });

    const status = project.status === "capturing" || project.status === "mapping" ? "validating" : project.status;
    await db.project.update({ where: { id: project.id }, data: { status } });

    return NextResponse.json({ mapId: map.id, version: map.version });
  });
}

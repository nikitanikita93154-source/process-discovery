import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const createSchema = z.object({
  title: z.string().trim().min(3, "Название: минимум 3 символа").max(200),
  description: z.string().trim().max(1000).optional(),
});

/** POST /api/projects — создать проект discovery. */
export async function POST(req: Request) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const data = await parseBody(req, createSchema);
    const project = await db.project.create({
      data: { orgId: owner.orgId, title: data.title, description: data.description ?? "", status: "draft" },
    });
    return NextResponse.json({ id: project.id });
  });
}

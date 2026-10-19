import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  hourlyRate: z.number().min(0).max(100000).optional(),
  departments: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
});

/** PATCH /api/org — настройки организации: ставка, отделы, название. */
export async function PATCH(req: Request) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const data = await parseBody(req, patchSchema);

    const org = await db.organization.update({
      where: { id: owner.orgId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.hourlyRate !== undefined ? { hourlyRate: data.hourlyRate } : {}),
        ...(data.departments !== undefined ? { departments: data.departments } : {}),
      },
    });
    return NextResponse.json({ ok: true, hourlyRate: org.hourlyRate });
  });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";

/** GET /api/candidates — список предложенных процессов (status=proposed). */
export async function GET() {
  return handle(async () => {
    const owner = await requireApiOwner();
    const candidates = await db.processCandidate.findMany({
      where: { orgId: owner.orgId, status: "proposed" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      candidates: candidates.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        origin: c.origin,
        evidence: c.evidence,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  });
}

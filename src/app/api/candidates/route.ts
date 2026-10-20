import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireApiOwner } from "@/lib/guards";
import { discoverFromT1 } from "@/lib/agent/routing";

export const maxDuration = 180;

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

/** POST /api/candidates — запустить поиск процессов в анкетах Теста 1 (кластеризация). */
export async function POST() {
  return handle(async () => {
    const owner = await requireApiOwner();
    const result = await discoverFromT1(owner.orgId);
    return NextResponse.json(result);
  });
}

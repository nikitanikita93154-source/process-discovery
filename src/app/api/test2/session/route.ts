import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import { INTERVIEW_LIMIT_MS } from "@/lib/schemas/test2";
import { currentTopicIndex } from "@/lib/agent/interview";

/** GET /api/test2/session — состояние сессии для возобновления после обрыва. */
export async function GET() {
  return handle(async () => {
    const user = await requireApiUser();

    const t1 = await db.test1Session.findUnique({ where: { userId: user.id } });
    if (t1?.status !== "completed") {
      return NextResponse.json({ test1Completed: false });
    }

    const row = await db.interviewSession.findFirst({
      where: { userId: user.id, status: { in: ["in_progress", "awaiting_confirmation"] } },
      orderBy: { startedAt: "desc" },
    });

    const completed = await db.interviewSession.findFirst({
      where: { userId: user.id, status: "completed" },
      orderBy: { startedAt: "desc" },
    });

    if (!row) {
      return NextResponse.json({
        test1Completed: true,
        session: null,
        hasCompleted: Boolean(completed),
      });
    }

    const agenda = (row.agenda as string[]) ?? [];
    const idx = currentTopicIndex({
      agenda,
      coverage: row.coverage as { topics: Record<string, string>; followUps: number },
    } as Parameters<typeof currentTopicIndex>[0]);

    return NextResponse.json({
      test1Completed: true,
      hasCompleted: Boolean(completed),
      session: {
        id: row.id,
        status: row.status,
        agenda,
        coverage: row.coverage,
        transcript: row.transcript,
        facts: row.facts,
        summary: row.summary,
        currentTopic: idx >= 0 ? agenda[idx] : "Резюме и подтверждение",
        topicNumber: Math.min(idx + 1, agenda.length),
        topicsTotal: agenda.length,
        elapsedMs: Date.now() - row.startedAt.getTime(),
        limitMs: INTERVIEW_LIMIT_MS,
      },
    });
  });
}

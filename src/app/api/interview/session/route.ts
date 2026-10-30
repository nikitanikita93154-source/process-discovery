import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import { ACTIVE_SESSION_STATUSES, SESSION_STATUS } from "@/lib/schemas/interview";
import { loadInterviewState, sessionSnapshot } from "@/lib/agent/session";

/** GET /api/interview/session — состояние сессии для возобновления после обрыва. */
export async function GET() {
  return handle(async () => {
    const user = await requireApiUser();

    const row = await db.interviewSession.findFirst({
      where: { userId: user.id, status: { in: [...ACTIVE_SESSION_STATUSES] } },
      orderBy: { startedAt: "desc" },
    });

    const completed = await db.interviewSession.findFirst({
      where: { userId: user.id, status: SESSION_STATUS.COMPLETED },
      orderBy: { startedAt: "desc" },
    });

    if (!row) {
      return NextResponse.json({ session: null, hasCompleted: Boolean(completed) });
    }

    const state = loadInterviewState(row, user.name ?? "Сотрудник");
    return NextResponse.json({
      hasCompleted: Boolean(completed),
      session: {
        ...sessionSnapshot(state),
        transcript: state.transcript,
        facts: state.facts,
        summary: state.summary,
      },
    });
  });
}

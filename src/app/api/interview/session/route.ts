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
      where: { userId: user.id, OR: [{ status: { in: [...ACTIVE_SESSION_STATUSES] } }, { status: SESSION_STATUS.COMPLETED, projectId: null }] },
      orderBy: { startedAt: "desc" },
    });

    const completed = await db.interviewSession.findFirst({
      where: { userId: user.id, status: SESSION_STATUS.COMPLETED, projectId: { not: null } },
      orderBy: { startedAt: "desc" },
    });

    if (!row) {
      return NextResponse.json({ session: null, hasCompleted: Boolean(completed) });
    }

    const state = loadInterviewState(row, user.name ?? "Сотрудник");
    if (state.status === SESSION_STATUS.COMPLETED && !row.projectId && state.summary) state.status = SESSION_STATUS.AWAITING_CONFIRMATION;
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

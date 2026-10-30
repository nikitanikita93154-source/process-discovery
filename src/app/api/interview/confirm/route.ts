import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import { confirmRequestSchema, SESSION_STATUS } from "@/lib/schemas/interview";
import { completeInterview } from "@/lib/agent/source";
import { loadInterviewState } from "@/lib/agent/session";

/** POST /api/interview/confirm — подтверждение резюме (правки вносятся в чате). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireApiUser();
    const { sessionId } = await parseBody(req, confirmRequestSchema);

    const row = await db.interviewSession.findFirst({ where: { id: sessionId, userId: user.id } });
    if (!row) throw new ApiError(404, "Сессия не найдена");
    if (row.status === SESSION_STATUS.COMPLETED) {
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }
    if (!row.summary) throw new ApiError(400, "Резюме ещё не сформировано");

    const state = loadInterviewState(row, user.name ?? "Сотрудник");
    const { projectId } = await completeInterview(state);
    return NextResponse.json({ ok: true, projectId });
  });
}

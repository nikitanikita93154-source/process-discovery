import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import { confirmRequestSchema } from "@/lib/schemas/test2";
import { completeInterview } from "@/lib/agent/source";
import type { InterviewState } from "@/lib/agent/interview";

/** POST /api/test2/confirm — подтверждение (с правками) резюме интервью. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireApiUser();
    const { sessionId, summary } = await parseBody(req, confirmRequestSchema);

    const row = await db.interviewSession.findFirst({ where: { id: sessionId, userId: user.id } });
    if (!row) throw new ApiError(404, "Сессия не найдена");
    if (row.status === "completed") {
      return NextResponse.json({ ok: true, alreadyCompleted: true });
    }

    // Сохраняем отредактированное резюме и финализируем
    const state: InterviewState = {
      sessionId: row.id,
      userId: row.userId,
      employeeName: user.name ?? "Сотрудник",
      status: row.status,
      startedAt: row.startedAt,
      agenda: (row.agenda as string[]) ?? [],
      coverage: row.coverage as InterviewState["coverage"],
      transcript: (row.transcript as InterviewState["transcript"]) ?? [],
      facts: (row.facts as InterviewState["facts"]) ?? [],
      summary,
      t1: null,
    };

    await db.interviewSession.update({
      where: { id: row.id },
      data: { summary, status: "awaiting_confirmation" },
    });

    const { projectId } = await completeInterview(state, row.projectId);
    return NextResponse.json({ ok: true, projectId });
  });
}

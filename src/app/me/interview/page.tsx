import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { InterviewChat, type InterviewSessionState } from "@/components/interview-chat";
import { ru } from "@/lib/content/ru";
import { loadInterviewState } from "@/lib/agent/session";
import { currentTopicIndex } from "@/lib/agent/interview";
import { TOPIC_SUMMARY } from "@/lib/agent/agenda";
import { ACTIVE_SESSION_STATUSES } from "@/lib/schemas/interview";

export default async function InterviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");

  const row = await db.interviewSession.findFirst({
    where: { userId: session.user.id, status: { in: [...ACTIVE_SESSION_STATUSES] } },
    orderBy: { startedAt: "desc" },
  });

  let initial: InterviewSessionState | null = null;
  if (row) {
    const state = loadInterviewState(row, session.user.name ?? "Сотрудник");
    const idx = currentTopicIndex(state);
    initial = {
      id: row.id,
      status: state.status,
      agenda: state.agenda,
      coverage: state.coverage,
      transcript: state.transcript,
      currentTopic: idx >= 0 ? state.agenda[idx] : TOPIC_SUMMARY,
      topicNumber: Math.min(idx + 1, state.agenda.length),
      topicsTotal: state.agenda.length,
      summary: state.summary,
    };
  }

  return (
    <div className="py-2">
      {initial && initial.transcript.length > 0 && (
        <div className="mx-auto mb-3 max-w-3xl rounded-[14px] bg-ok-soft px-4 py-2 text-sm text-ok">
          {ru.interview.sessionRestored}
        </div>
      )}
      <InterviewChat initialSession={initial} />
    </div>
  );
}

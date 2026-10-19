import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Test2Chat, type Test2SessionState } from "@/components/test2-chat";
import { Button } from "@/components/ui/button";
import { ru } from "@/lib/content/ru";
import { currentTopicIndex } from "@/lib/agent/interview";
import type { InterviewSummary, TranscriptItem } from "@/lib/schemas/test2";

export default async function Test2Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");

  const t1 = await db.test1Session.findUnique({ where: { userId: session.user.id } });
  if (t1?.status !== "completed") {
    return (
      <div className="mx-auto max-w-md space-y-4 py-20 text-center">
        <p className="text-lg font-medium">{ru.test2.needTest1}</p>
        <Link href="/me/test1">
          <Button>{ru.nav.test1}</Button>
        </Link>
      </div>
    );
  }

  const row = await db.interviewSession.findFirst({
    where: { userId: session.user.id, status: { in: ["in_progress", "awaiting_confirmation"] } },
    orderBy: { startedAt: "desc" },
  });

  let initial: Test2SessionState | null = null;
  if (row) {
    const agenda = (row.agenda as string[]) ?? [];
    const coverage = (row.coverage as { topics: Record<string, string>; followUps: number }) ?? { topics: {}, followUps: 0 };
    const idx = currentTopicIndex({ agenda, coverage } as Parameters<typeof currentTopicIndex>[0]);
    initial = {
      id: row.id,
      status: row.status,
      agenda,
      coverage,
      transcript: (row.transcript as TranscriptItem[]) ?? [],
      currentTopic: idx >= 0 ? agenda[idx] : "Резюме и подтверждение",
      topicNumber: Math.min(idx + 1, agenda.length),
      topicsTotal: agenda.length,
      summary: (row.summary as InterviewSummary | null) ?? null,
    };
  }

  return (
    <div className="py-2">
      {initial && initial.transcript.length > 0 && (
        <div className="mx-auto mb-3 max-w-3xl rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {ru.test2.sessionRestored}
        </div>
      )}
      <Test2Chat initialSession={initial} />
    </div>
  );
}

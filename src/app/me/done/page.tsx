import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterviewSummary } from "@/lib/schemas/test2";

export default async function DonePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");

  const interview = await db.interviewSession.findFirst({
    where: { userId: session.user.id, status: "completed" },
    orderBy: { startedAt: "desc" },
  });

  const summary = (interview?.summary as InterviewSummary | null) ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="text-center">
        <div className="text-5xl">✅</div>
        <h1 className="mt-4 text-2xl font-bold">{ru.done.title}</h1>
        <p className="mt-2 text-zinc-500">{ru.done.subtitle}</p>
      </div>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>{ru.done.interviewSummary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.processes.map((p, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 p-4">
                <div className="font-medium">{p.name}</div>
                {p.steps.length > 0 && (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
                    {p.steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                  {p.actors.length > 0 && <span>Участники: {p.actors.join(", ")}</span>}
                  {p.systems.length > 0 && <span>Системы: {p.systems.join(", ")}</span>}
                  {p.volume && <span>Объём: {p.volume}</span>}
                  {p.pain && <span>Боль: {p.pain}</span>}
                </div>
              </div>
            ))}
            {summary.open_questions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{ru.test2.confirmOpenQuestions}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-600">
                  {summary.open_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="text-center">
        <Link href="/me">
          <Button variant="outline">{ru.done.backToMe}</Button>
        </Link>
      </div>
    </div>
  );
}

import { Check } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/brand";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterviewSummary } from "@/lib/schemas/interview";

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
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-lime"><Check className="h-9 w-9" strokeWidth={1.5} aria-hidden="true" /></div>
        <Eyebrow className="mt-6">Чекап · Интервью завершено</Eyebrow><PageTitle className="mt-3">{ru.done.title}</PageTitle>
        <p className="mt-2 text-muted">{ru.done.subtitle}</p>
      </div>

      {summary && (
        <Card className="border-line-warm bg-paper">
          <CardHeader>
            <Eyebrow className="text-accent">Резюме</Eyebrow><CardTitle>{ru.done.interviewSummary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.processes.map((p, i) => (
              <div key={i} className="rounded-[14px] border border-line-warm bg-cream p-5">
                <div className="font-medium">{p.name}</div>
                {p.steps.length > 0 && (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                    {p.steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                )}
                <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase leading-relaxed text-muted">
                  {p.actors.length > 0 && <span>Участники: {p.actors.join(", ")}</span>}
                  {p.systems.length > 0 && <span>Системы: {p.systems.join(", ")}</span>}
                  {p.volume && <span>Объём: {p.volume}</span>}
                  {p.pain && <span>Трудности: {p.pain}</span>}
                </div>
              </div>
            ))}
            {/* open_questions сознательно не показываем сотруднику:
                это вопросы для владельца/аналитика, хранятся в БД */}
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

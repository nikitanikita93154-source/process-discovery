import { Check, ArrowUpRight } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/brand";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeVariant, statusLabel } from "@/lib/status";
import { ACTIVE_SESSION_STATUSES, SESSION_STATUS } from "@/lib/schemas/interview";

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");

  const [activeInterview, completedInterview] = await Promise.all([
    db.interviewSession.findFirst({
      where: { userId: session.user.id, status: { in: [...ACTIVE_SESSION_STATUSES] } },
      orderBy: { startedAt: "desc" },
    }),
    db.interviewSession.findFirst({
      where: { userId: session.user.id, status: SESSION_STATUS.COMPLETED },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const status = activeInterview?.status ?? (completedInterview ? SESSION_STATUS.COMPLETED : "not_started");
  const done = status === SESSION_STATUS.COMPLETED;

  return (
    <div className="space-y-6">
      <div className="space-y-2"><Eyebrow>SYNAPT · МОЙ ЧЕКАП</Eyebrow><PageTitle>{ru.nav.me}</PageTitle><p className="max-w-2xl text-sm leading-relaxed text-muted">Ваш опыт поможет команде увидеть, где процессы можно сделать проще.</p></div>
      <div className="grid max-w-3xl gap-4">
        <Card className="border-line-warm bg-paper">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{ru.nav.interview}</CardTitle>
              <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
            </div>
            <CardDescription>{ru.interview.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ok"><Check className="mr-1 inline h-4 w-4" /> {ru.done.title}</p>
                <Link href="/me/done" className="text-sm text-ink hover:underline">
                  {ru.done.interviewSummary} →
                </Link>
              </div>
            ) : (
              <Link href="/me/interview">
                <Button className="text-lime" size="lg">{status === "in_progress" || status === "awaiting_confirmation" ? "Продолжить" : "Начать интервью"}<ArrowUpRight className="h-4 w-4" /></Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ru } from "@/lib/content/ru";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBadgeVariant, statusLabel } from "@/lib/status";

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");

  const [test1, activeInterview, completedInterview] = await Promise.all([
    db.test1Session.findUnique({ where: { userId: session.user.id } }),
    db.interviewSession.findFirst({
      where: { userId: session.user.id, status: { in: ["in_progress", "awaiting_confirmation"] } },
      orderBy: { startedAt: "desc" },
    }),
    db.interviewSession.findFirst({
      where: { userId: session.user.id, status: "completed" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const t1Status = test1?.status ?? "not_started";
  const t1Done = t1Status === "completed";
  const t2Status = activeInterview?.status ?? (completedInterview ? "completed" : "not_started");
  const t2Done = t2Status === "completed";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{ru.nav.me}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{ru.nav.test1}</CardTitle>
              <Badge variant={statusBadgeVariant(t1Status)}>{statusLabel(t1Status)}</Badge>
            </div>
            <CardDescription>Анкета-скрининг: 13 вопросов, 5–7 минут</CardDescription>
          </CardHeader>
          <CardContent>
            {t1Done ? (
              <p className="text-sm text-emerald-600">✓ {ru.test1.completed}</p>
            ) : (
              <Link href="/me/test1">
                <Button>{t1Status === "in_progress" ? "Продолжить" : "Начать тест"}</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className={t1Done ? "" : "opacity-70"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{ru.nav.test2}</CardTitle>
              <Badge variant={statusBadgeVariant(t2Status)}>{statusLabel(t2Status)}</Badge>
            </div>
            <CardDescription>AI-агент-интервью в чате, 10–15 минут</CardDescription>
          </CardHeader>
          <CardContent>
            {t2Done ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-600">✓ {ru.test1.completed}</p>
                <Link href="/me/done" className="text-sm text-indigo-600 hover:underline">
                  {ru.done.interviewSummary} →
                </Link>
              </div>
            ) : t1Done ? (
              <Link href="/me/test2">
                <Button>{t2Status === "in_progress" ? "Продолжить" : "Начать интервью"}</Button>
              </Link>
            ) : (
              <p className="text-sm text-zinc-500">Откроется после завершения Теста 1</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

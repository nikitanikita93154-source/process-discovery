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
      <h1 className="text-2xl font-bold">{ru.nav.me}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{ru.nav.interview}</CardTitle>
              <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
            </div>
            <CardDescription>{ru.interview.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-600">✓ {ru.done.title}</p>
                <Link href="/me/done" className="text-sm text-indigo-600 hover:underline">
                  {ru.done.interviewSummary} →
                </Link>
              </div>
            ) : (
              <Link href="/me/interview">
                <Button>{status === "in_progress" || status === "awaiting_confirmation" ? "Продолжить" : "Начать интервью"}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

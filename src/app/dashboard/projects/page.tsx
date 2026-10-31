import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { Eyebrow, PageTitle } from "@/components/ui/brand";
import { Card, CardContent } from "@/components/ui/card";
import { interviewSummarySchema } from "@/lib/schemas/interview";

export default async function ProjectsPage() {
  const owner = await requirePageOwner();
  const employees = await db.user.findMany({
    where: { orgId: owner.orgId, role: "EMPLOYEE" },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true,
      interviews: {
        where: { status: { in: ["completed", "in_progress", "awaiting_confirmation"] } },
        orderBy: { startedAt: "desc" },
        select: { status: true, summary: true },
      },
    },
  });
  const completed = employees.filter((e) => e.interviews.some((i) => i.status === "completed")).length;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>SYNAPT · РАБОТА КОМПАНИИ</Eyebrow>
          <PageTitle>Задачи сотрудников</PageTitle>
          <p className="max-w-2xl text-sm text-muted">Посмотрите, чем занимаются сотрудники и какие задачи они описали в интервью.</p>
        </div>
        <Link href="/dashboard/projects/processes" className="text-sm text-muted hover:text-ink hover:underline">Разбор процессов <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted"><Users className="h-4 w-4" /> Интервью завершили: {completed} из {employees.length}</div>
      {employees.length === 0 ? (
        <Card><CardContent className="space-y-2 p-6"><p>Пока нет сотрудников.</p><p className="text-sm text-muted">Пригласите их на <Link href="/dashboard" className="text-ink underline">странице команды</Link>, чтобы собрать их задачи.</p></CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {employees.map((employee) => {
            const interview = employee.interviews.find((i) => i.status === "completed");
            const parsed = interviewSummarySchema.safeParse(interview?.summary);
            const summary = parsed.success ? parsed.data : null;
            const active = employee.interviews.some((i) => i.status === "in_progress" || i.status === "awaiting_confirmation");
            const position = [summary?.employee?.position, summary?.employee?.department].filter(Boolean).join(" · ");
            return (
              <Link key={employee.id} href={`/dashboard/projects/employees/${employee.id}`} className="group block rounded-[22px]">
                <Card className="h-full transition-colors hover:border-ink hover:bg-cream"><CardContent className="flex h-full items-center justify-between gap-4 p-5">
                  <div className="min-w-0 space-y-1"><p className="font-medium">{employee.name}</p><p className="text-sm text-muted">{position || "Должность не указана"}</p><p className="text-xs text-muted">{interview ? summary ? `Задач в интервью: ${summary.processes.length}` : "Резюме недоступно" : active ? "Интервью не завершено" : "Интервью не пройдено"}</p></div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted group-hover:text-ink" />
                </CardContent></Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

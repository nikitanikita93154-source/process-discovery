import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { interviewSummarySchema } from "@/lib/schemas/interview";
import { Eyebrow, PageTitle } from "@/components/ui/brand";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default async function EmployeeTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requirePageOwner();
  const { id } = await params;
  const employee = await db.user.findFirst({
    where: { id, orgId: owner.orgId, role: "EMPLOYEE" },
    select: {
      name: true,
      interviews: {
        where: { status: { in: ["completed", "in_progress", "awaiting_confirmation"] } },
        orderBy: { startedAt: "desc" },
        select: { status: true, summary: true, endedAt: true, startedAt: true },
      },
    },
  });
  if (!employee) notFound();
  const interview = employee.interviews.find((i) => i.status === "completed");
  const parsed = interviewSummarySchema.safeParse(interview?.summary);
  const summary = parsed.success ? parsed.data : null;
  const active = employee.interviews.some((i) => i.status === "in_progress" || i.status === "awaiting_confirmation");
  const position = [summary?.employee?.position, summary?.employee?.department].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/dashboard/projects" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Все сотрудники</Link>
      <div className="space-y-2"><Eyebrow>SYNAPT · СОТРУДНИК</Eyebrow><PageTitle>{employee.name}</PageTitle><p className="text-sm text-muted">{position || "Должность не указана"}</p></div>
      {!interview ? (
        <Card><CardContent className="p-6 text-sm text-muted">{active ? "Интервью ещё не завершено. Задачи появятся после подтверждения резюме сотрудником." : "Сотрудник ещё не прошёл интервью. После его завершения здесь появятся задачи."}</CardContent></Card>
      ) : !summary ? (
        <Card><CardContent className="p-6 text-sm text-muted">Не удалось прочитать резюме интервью.</CardContent></Card>
      ) : (
        <section className="space-y-4">
          <div><h2 className="font-head text-xl font-medium">Задачи</h2><p className="mt-1 text-sm text-muted">Из последнего завершённого интервью · {formatDate((interview.endedAt ?? interview.startedAt).toISOString())}</p></div>
          {summary.processes.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted">В резюме интервью задачи не указаны.</CardContent></Card> : summary.processes.map((task, index) => (
            <Card key={`${task.name}-${index}`}><CardContent className="space-y-4 p-5 sm:p-6">
              <h3 className="text-base font-medium">{task.name}</h3>
              {task.detail_status && <p className="text-xs text-muted">{task.detail_status === "discussed" ? "Обсуждена подробнее" : "Упомянута, детали не разобраны"}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                <span>Частота: {task.frequency || "не указана"}</span><span>Время: {task.duration || "не указано"}</span>{task.volume && <span>Объём: {task.volume}</span>}
              </div>
              {task.steps.length > 0 && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Как выполняется</p><ol className="list-decimal space-y-1 pl-5 text-sm">{task.steps.map((step, i) => <li key={i}>{step}</li>)}</ol></div>}
              {task.systems.length > 0 && <p className="text-sm"><span className="text-muted">Программы и системы: </span>{task.systems.join(", ")}</p>}
              {task.actors.length > 0 && <p className="text-sm"><span className="text-muted">Участники: </span>{task.actors.join(", ")}</p>}
              {task.pain && <p className="text-sm"><span className="text-muted">Трудности: </span>{task.pain}</p>}
            </CardContent></Card>
          ))}
        </section>
      )}
    </div>
  );
}

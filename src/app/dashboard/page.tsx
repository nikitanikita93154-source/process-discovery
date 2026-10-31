import { Eyebrow, PageTitle } from "@/components/ui/brand";
import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ru } from "@/lib/content/ru";
import { DashboardTable, OrgProgressCards } from "@/components/dashboard-table";
import { formatDate } from "@/lib/utils";
import { TeamClient } from "@/components/team-client";

export default async function DashboardPage() {
  const user = await requirePageOwner();

  const [org, employees] = await Promise.all([db.organization.findUnique({ where: { id: user.orgId }, select: { name: true, inviteCode: true } }), db.user.findMany({
    where: { orgId: user.orgId, role: "EMPLOYEE" },
    include: { interviews: { orderBy: { startedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  })]);

  const interviewDone = employees.filter((e) => e.interviews.some((i) => i.status === "completed")).length;
  const total = employees.length;

  return (
    <div className="space-y-6">
      <div className="space-y-2"><Eyebrow>SYNAPT · КОМАНДА</Eyebrow><PageTitle>{ru.nav.team}</PageTitle><p className="max-w-2xl text-sm leading-relaxed text-muted">Сотрудники и прогресс интервью — в одном месте.</p></div>

      <OrgProgressCards total={total} interviewDone={interviewDone} />
      {org && <TeamClient orgName={org.name} inviteCode={org.inviteCode} />}

      <DashboardTable
        rows={employees.map((e) => {
          const lastInterview = e.interviews[0];
          const lastCompleted = e.interviews.find((i) => i.status === "completed");
          const summary = lastCompleted?.summary as { employee?: { department?: string } } | null;
          return {
            id: e.id,
            name: e.name,
            department: summary?.employee?.department ?? "—",
            status: lastInterview?.status ?? "not_started",
            date: formatDate(lastInterview?.endedAt ?? lastInterview?.startedAt),
          };
        })}
      />
    </div>
  );
}

import { Eyebrow, PageTitle } from "@/components/ui/brand";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ru } from "@/lib/content/ru";
import { DashboardTable, OrgProgressCards } from "@/components/dashboard-table";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requirePageOwner();

  const employees = await db.user.findMany({
    where: { orgId: user.orgId, role: "EMPLOYEE" },
    include: { interviews: { orderBy: { startedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });

  const interviewDone = employees.filter((e) => e.interviews.some((i) => i.status === "completed")).length;
  const total = employees.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2"><Eyebrow>SYNAPT · ОБЗОР</Eyebrow><PageTitle>{ru.nav.dashboard}</PageTitle><p className="max-w-2xl text-sm leading-relaxed text-muted">Вся команда и прогресс чекапа — в одном месте.</p></div>
        <Link href="/dashboard/team" className="rounded-full border border-line px-5 py-2.5 text-sm text-ink transition-colors hover:border-ink">
          {ru.nav.team} →
        </Link>
      </div>

      <OrgProgressCards total={total} interviewDone={interviewDone} />

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
            date: formatDate(lastCompleted?.endedAt ?? e.createdAt),
          };
        })}
      />
    </div>
  );
}

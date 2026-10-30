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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{ru.nav.dashboard}</h1>
        <Link href="/dashboard/team" className="text-sm text-indigo-600 hover:underline">
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

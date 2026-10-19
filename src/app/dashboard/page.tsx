import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ru } from "@/lib/content/ru";
import { DashboardTable, OrgProgressCards } from "@/components/dashboard-table";
import { formatDate } from "@/lib/utils";
import type { Test1Answers } from "@/lib/schemas/test1";

export default async function DashboardPage() {
  const user = await requirePageOwner();

  const employees = await db.user.findMany({
    where: { orgId: user.orgId, role: "EMPLOYEE" },
    include: { test1: true, interviews: { orderBy: { startedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });

  const t1Done = employees.filter((e) => e.test1?.status === "completed").length;
  const t2Done = employees.filter((e) => e.interviews.some((i) => i.status === "completed")).length;
  const total = employees.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{ru.nav.dashboard}</h1>
        <Link href="/dashboard/team" className="text-sm text-indigo-600 hover:underline">
          {ru.nav.team} →
        </Link>
      </div>

      <OrgProgressCards total={total} t1Done={t1Done} t2Done={t2Done} />

      <DashboardTable
        rows={employees.map((e) => {
          const answers = e.test1?.answers as Test1Answers | null;
          const lastInterview = e.interviews[0];
          const t2Status =
            lastInterview?.status ?? (e.test1?.status === "completed" ? "not_started" : "not_started");
          return {
            id: e.id,
            name: e.name,
            department: answers?.passport?.department ?? "—",
            t1Status: e.test1?.status ?? "not_started",
            t2Status,
            date: formatDate(e.test1?.completedAt ?? e.createdAt),
          };
        })}
      />
    </div>
  );
}

import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { TeamClient } from "@/components/team-client";
import { OrgSettings } from "@/components/org-settings";

export default async function TeamPage() {
  const owner = await requirePageOwner();

  const [org, employees] = await Promise.all([
    db.organization.findUnique({ where: { id: owner.orgId } }),
    db.user.findMany({
      where: { orgId: owner.orgId, role: "EMPLOYEE" },
      include: { interviews: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <TeamClient
        orgName={org?.name ?? ""}
        inviteCode={org?.inviteCode ?? ""}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          email: e.email,
          interview: e.interviews.some((i) => i.status === "completed") ? "✓" : "—",
        }))}
      />
      <OrgSettings
        initialRate={org?.hourlyRate ?? 50}
        initialDepartments={(org?.departments as string[] | null) ?? []}
      />
    </div>
  );
}

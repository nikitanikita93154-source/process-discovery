import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ProjectsClient } from "@/components/projects-client";

export default async function ProjectsPage() {
  const owner = await requirePageOwner();

  const projects = await db.project.findMany({
    where: { orgId: owner.orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sources: true, conflicts: { where: { resolved: false } } } } },
  });

  return (
    <ProjectsClient
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        sourcesCount: p._count.sources,
        conflictsCount: p._count.conflicts,
      }))}
    />
  );
}

import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ProjectsClient } from "@/components/projects-client";
import type { EvidenceItem } from "@/lib/schemas/candidate";

export default async function ProjectsPage() {
  const owner = await requirePageOwner();

  const [projects, candidates] = await Promise.all([
    db.project.findMany({
      where: { orgId: owner.orgId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { sources: true, conflicts: { where: { resolved: false } } } } },
    }),
    db.processCandidate.findMany({
      where: { orgId: owner.orgId, status: "proposed" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <ProjectsClient
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        origin: p.origin,
        autoReason: p.autoReason,
        createdAt: p.createdAt.toISOString(),
        sourcesCount: p._count.sources,
        conflictsCount: p._count.conflicts,
      }))}
      candidates={candidates.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        origin: c.origin,
        evidence: (c.evidence as EvidenceItem[] | null) ?? [],
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}

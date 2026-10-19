import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageOwner } from "@/lib/page-guards";
import { ru } from "@/lib/content/ru";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourcesClient } from "@/components/sources-client";
import { MapClient } from "@/components/map-client";
import { AnalysisClient } from "@/components/analysis-client";
import { statusBadgeVariant, statusLabel } from "@/lib/status";
import type { ParsedSource } from "@/lib/schemas/source";
import type { ProcessMapJson } from "@/lib/schemas/map";
import type { AnalysisScores, Swot } from "@/lib/schemas/analysis";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requirePageOwner();
  const { id } = await params;

  // Изоляция организаций: чужой проект → 404
  const project = await db.project.findFirst({ where: { id, orgId: owner.orgId } });
  if (!project) notFound();

  const [sources, conflicts, maps, followUps] = await Promise.all([
    db.source.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }),
    db.conflict.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { title: true } } },
    }),
    db.processMap.findMany({ where: { projectId: id }, orderBy: { version: "desc" } }),
    db.followUpQuestion.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  const latestMap = maps[0] ?? null;
  const latestReport = latestMap
    ? await db.analysisReport.findFirst({
        where: { mapId: latestMap.id },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const mapComments = latestMap
    ? await db.comment.findMany({
        where: { mapId: latestMap.id },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      })
    : [];
  const sourceNames = Object.fromEntries(sources.map((s) => [s.id, s.name]));

  const conflictDocNames = new Map(
    await Promise.all(
      [...new Set(conflicts.map((c) => c.docSourceId))].map(async (sid) => {
        const s = await db.source.findUnique({ where: { id: sid } });
        return [sid, s?.name ?? ""] as const;
      }),
    ),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/projects" className="text-sm text-zinc-500 hover:underline">
            {ru.project.backToProjects}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{project.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
            <Badge variant={statusBadgeVariant(project.status)}>{statusLabel(project.status)}</Badge>
            {project.description && <span>{project.description}</span>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">{ru.project.tabSources}</TabsTrigger>
          <TabsTrigger value="map">
            {ru.project.tabMap} {latestMap ? `· v${latestMap.version}` : ""}
          </TabsTrigger>
          <TabsTrigger value="analysis">{ru.project.tabAnalysis}</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <SourcesClient
            projectId={id}
            sources={sources.map((s) => ({
              id: s.id,
              type: s.type,
              name: s.name,
              status: s.status,
              parsed: (s.parsedJson as ParsedSource | null) ?? null,
              createdAt: s.createdAt.toISOString(),
            }))}
            conflicts={conflicts.map((c) => ({
              id: c.id,
              description: c.description,
              resolved: c.resolved,
              docSourceName: conflictDocNames.get(c.docSourceId) ?? "",
            }))}
          />
        </TabsContent>

        <TabsContent value="map">
          <MapClient
            projectId={id}
            map={
              latestMap
                ? {
                    id: latestMap.id,
                    version: latestMap.version,
                    author: latestMap.author,
                    createdAt: latestMap.createdAt.toISOString(),
                    json: latestMap.json as ProcessMapJson,
                  }
                : null
            }
            versions={maps.map((m) => ({
              id: m.id,
              version: m.version,
              author: m.author,
              createdAt: m.createdAt.toISOString(),
            }))}
            sourceNames={sourceNames}
            comments={mapComments.map((c) => ({
              id: c.id,
              nodeId: c.nodeId,
              body: c.body,
              parentId: c.parentId,
              resolved: c.resolved,
              createdAt: c.createdAt.toISOString(),
              authorName: c.author.name,
            }))}
            followUps={followUps.map((f) => ({ id: f.id, text: f.text, status: f.status }))}
          />
        </TabsContent>

        <TabsContent value="analysis">
          <AnalysisClient
            mapId={latestMap?.id ?? null}
            report={
              latestReport
                ? {
                    scores: latestReport.scores as AnalysisScores,
                    swot: latestReport.swot as Swot,
                    createdAt: latestReport.createdAt.toISOString(),
                  }
                : null
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

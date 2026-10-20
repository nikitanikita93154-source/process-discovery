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
import { ProjectT1Panel, matchT1ToSteps } from "@/components/project-t1-panel";
import { ProjectParticipants } from "@/components/project-participants";
import { statusBadgeVariant, statusLabel } from "@/lib/status";
import type { ParsedSource } from "@/lib/schemas/source";
import type { ProcessMapJson } from "@/lib/schemas/map";
import type { AnalysisScores, Swot } from "@/lib/schemas/analysis";
import type { Test1Answers } from "@/lib/schemas/test1";

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

  // Панель «Что говорят анкеты»: задачи Т1 организации, совпадающие с шагами проекта
  const t1Rows = await db.test1Session.findMany({
    where: { status: "completed", user: { orgId: owner.orgId } },
    include: { user: { select: { name: true } } },
  });
  const stepNames = sources.flatMap((s) => {
    const p = s.parsedJson as ParsedSource | null;
    return (p?.candidateSteps ?? []).map((st) => st.name);
  });
  for (const stage of latestMap ? (latestMap.json as ProcessMapJson).stages : []) {
    stepNames.push(...stage.steps.map((st) => st.name));
  }
  const t1Mentions = matchT1ToSteps(
    t1Rows.map((r) => {
      const a = r.answers as Test1Answers | null;
      return {
        name: r.user.name,
        department: a?.passport?.department ?? "—",
        tasks: (a?.tasks ?? []).map((t) => ({
          title: t.title,
          frequency: t.frequency,
          duration: t.duration,
          irritation: t.irritation,
        })),
      };
    }),
    stepNames,
  );

  // Участники проекта (ручное назначение) + свободные сотрудники с подсказкой совпадений
  const participants = await db.projectParticipant.findMany({
    where: { projectId: id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          test1: { select: { status: true, answers: true } },
          interviews: { select: { status: true } },
        },
      },
    },
    orderBy: { assignedAt: "asc" },
  });
  const assignedIds = new Set(participants.map((p) => p.user.id));
  const employees = await db.user.findMany({
    where: { orgId: owner.orgId, role: "EMPLOYEE" },
    select: {
      id: true,
      name: true,
      test1: { select: { status: true, answers: true } },
      interviews: { select: { status: true } },
    },
    orderBy: { name: "asc" },
  });
  const employeeMatches = (userId: string): boolean => {
    const e = employees.find((x) => x.id === userId);
    if (!e) return false;
    const a = e.test1?.answers as Test1Answers | null;
    const mentions = matchT1ToSteps(
      [{ name: e.name, department: a?.passport?.department ?? "—", tasks: (a?.tasks ?? []).map((t) => ({ title: t.title, frequency: t.frequency, duration: t.duration, irritation: t.irritation })) }],
      stepNames,
    );
    return mentions.length > 0;
  };
  const deptOf = (e: { test1?: { answers: unknown } | null }): string => {
    const a = e.test1?.answers as Test1Answers | null;
    return a?.passport?.department ?? "—";
  };
  const t2StatusOf = (e: { interviews: { status: string }[] }): string =>
    e.interviews.some((i) => i.status === "completed")
      ? "completed"
      : e.interviews.some((i) => i.status === "in_progress" || i.status === "awaiting_confirmation")
        ? "in_progress"
        : "not_started";

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
          <div className="space-y-4">
            <ProjectParticipants
              projectId={id}
              participants={participants.map((p) => ({
                id: p.user.id,
                name: p.user.name,
                department: deptOf(p.user),
                t1: p.user.test1?.status ?? "not_started",
                t2: t2StatusOf(p.user),
              }))}
              available={employees
                .filter((e) => !assignedIds.has(e.id))
                .map((e) => ({
                  id: e.id,
                  name: e.name,
                  department: deptOf(e),
                  tasksMatch: employeeMatches(e.id),
                }))}
            />
            <ProjectT1Panel mentions={t1Mentions} />
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
          </div>
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

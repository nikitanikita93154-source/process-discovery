import { Eyebrow, PageTitle } from "@/components/ui/brand";
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
import { ProjectParticipants } from "@/components/project-participants";
import { statusBadgeVariant, statusLabel } from "@/lib/status";
import { employeesForProject, contributingInterviews } from "@/lib/agent/employees";
import type { ParsedSource } from "@/lib/schemas/source";
import type { ProcessMapJson } from "@/lib/schemas/map";
import type { AnalysisScores, Swot } from "@/lib/schemas/analysis";
import type { Fact, InterviewSummary } from "@/lib/schemas/interview";

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

/** Последнее завершённое интервью сотрудника (сводные данные). */
interface InterviewBrief {
  status: string;
  summary: InterviewSummary | null;
  facts: Fact[];
}

function latestCompleted(interviews: InterviewBrief[]): InterviewBrief | null {
  return interviews.find((i) => i.status === "completed") ?? null;
}

function interviewStatus(interviews: { status: string }[]): string {
  return interviews.some((i) => i.status === "completed")
    ? "completed"
    : interviews.some((i) => i.status === "in_progress" || i.status === "awaiting_confirmation")
      ? "in_progress"
      : "not_started";
}

/** Совпадают ли задачи/шаги из фактов интервью сотрудника с шагами проекта. */
function factsMatchStepNames(facts: Fact[], stepNames: string[]): boolean {
  const keys = stepNames.map(norm).filter(Boolean);
  if (keys.length === 0) return false;
  return facts
    .filter((f) => f.type === "task" || f.type === "step")
    .some((f) => {
      const n = norm(f.name);
      return keys.some((k) => k === n || (n.length >= 6 && k.includes(n)) || (k.length >= 6 && n.includes(k)));
    });
}

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

  // Сотрудники, описавшие процесс: источники проекта + интервью организации
  // с совпадающим по названию процессом в резюме
  const orgInterviewSources = await db.source.findMany({
    where: { project: { orgId: owner.orgId }, type: "interview" },
    select: { id: true, name: true, projectId: true, parsedJson: true },
  });
  const orgProjectTitles = Object.fromEntries(
    (await db.project.findMany({ where: { orgId: owner.orgId }, select: { id: true, title: true } })).map((p) => [
      p.id,
      p.title,
    ]),
  );
  const describedBy = employeesForProject(id, project.title, orgInterviewSources);
  const contributors = contributingInterviews(id, project.title, orgInterviewSources, orgProjectTitles);

  const stepNames = sources.flatMap((s) => {
    const p = s.parsedJson as ParsedSource | null;
    return (p?.candidateSteps ?? []).map((st) => st.name);
  });
  for (const stage of latestMap ? (latestMap.json as ProcessMapJson).stages : []) {
    stepNames.push(...stage.steps.map((st) => st.name));
  }

  // Участники проекта (ручное назначение) + свободные сотрудники с подсказкой совпадений
  const participants = await db.projectParticipant.findMany({
    where: { projectId: id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          interviews: { select: { status: true, summary: true, facts: true }, orderBy: { startedAt: "desc" } },
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
      interviews: { select: { status: true, summary: true, facts: true }, orderBy: { startedAt: "desc" } },
    },
    orderBy: { name: "asc" },
  });

  const deptOf = (interviews: InterviewBrief[]): string =>
    latestCompleted(interviews)?.summary?.employee?.department ?? "—";

  const conflictDocNames = new Map(
    await Promise.all(
      [...new Set(conflicts.map((c) => c.docSourceId))].map(async (sid) => {
        const s = await db.source.findUnique({ where: { id: sid } });
        return [sid, s?.name ?? ""] as const;
      }),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/projects" className="mb-5 inline-block text-sm text-muted hover:text-ink hover:underline">
            {ru.project.backToProjects}
          </Link>
          <div className="space-y-2"><Eyebrow>SYNAPT · ПРОЕКТ</Eyebrow><PageTitle>{project.title}</PageTitle></div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge variant={statusBadgeVariant(project.status)}>{statusLabel(project.status)}</Badge>
            {project.description && <span>{project.description}</span>}
          </div>
          {describedBy.length > 0 && (
            <div className="mt-1 text-sm text-muted" title={ru.projects.employeesHint}>
              <span className="text-xs font-medium text-muted">{ru.projects.employees}: </span>
              {describedBy.join(", ")}
            </div>
          )}
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
          <div className="space-y-6">
            <ProjectParticipants
              projectId={id}
              participants={participants.map((p) => ({
                id: p.user.id,
                name: p.user.name,
                department: deptOf(p.user.interviews as InterviewBrief[]),
                interview: interviewStatus(p.user.interviews),
              }))}
              available={employees
                .filter((e) => !assignedIds.has(e.id))
                .map((e) => {
                  const briefs = e.interviews as InterviewBrief[];
                  const done = latestCompleted(briefs);
                  return {
                    id: e.id,
                    name: e.name,
                    department: deptOf(briefs),
                    tasksMatch: done ? factsMatchStepNames(done.facts ?? [], stepNames) : false,
                  };
                })}
            />
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
            contributors={contributors}
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

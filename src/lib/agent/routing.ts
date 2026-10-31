import { db } from "@/lib/db";
import { chat } from "@/lib/llm";
import {
  docProcessDetectionSchema,
  routingSchema,
  mergeEvidence,
  type EvidenceItem,
  type Routing,
} from "@/lib/schemas/candidate";
import type { InterviewSummary } from "@/lib/schemas/interview";
import { processMapJsonSchema, type ProcessMapJson } from "@/lib/schemas/map";
import type { ParsedSource } from "@/lib/schemas/source";

// ============================================================
// Маршрутизация обнаруженных процессов: интервью/документы →
// существующий проект или новый ProcessCandidate.
// LLM-независимый fallback сохраняет прежнее поведение.
// ============================================================

export interface RouteResult {
  /** Проект, к которому привязать источник (может быть создан). */
  projectId: string;
  /** Созданные кандидаты (если процесс новый). */
  createdCandidates: number;
  /** Объяснение решения (для autoReason). */
  reason: string;
  /** Семантические связи «процесс резюме → проект/кандидат». */
  processLinks: ProcessLink[];
}

/** Связь процесса из резюме с проектом или кандидатом (по смыслу). */
export type ProcessLink = {
  process: string;
  projectId?: string;
  candidateId?: string;
};

/** Результат LLM-матчинга процессов (без побочных эффектов). */
export interface ProcessMatchResult {
  attachToProjectId: string | null;
  matchReason?: string;
  links: ProcessLink[];
  /** Дополнения к доказательствам существующих кандидатов. */
  evidenceUpdates: { candidateId: string; item: EvidenceItem }[];
  newCandidates: Routing["newCandidates"];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

/** Похожи ли два названия (частичное вхождение нормализованных форм). */
export function titlesSimilar(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

/**
 * LLM-матчинг процессов резюме против проектов и кандидатов организации.
 * Сопоставление ПО СМЫСЛУ: формулировки сотрудников могут отличаться.
 * Валидирует id по фактическим спискам — модель не может сослаться на чужое.
 */
export async function matchProcesses(
  employeeName: string,
  summary: InterviewSummary,
  projects: { id: string; title: string; description: string | null }[],
  candidates: { id: string; title: string }[],
): Promise<ProcessMatchResult> {
  const routing = await chat(
    [
      {
        role: "system",
        content: `Ты — диспетчер процессов. Соотнеси процессы из резюме интервью с существующими проектами и кандидатами организации ПО СМЫСЛУ — формулировки могут заметно отличаться («занесение результатов звонков в CRM» = «внесение и актуализация данных в CRM после звонка»). Для КАЖДОГО процесса верни элемент matches: projectId (совпадение с проектом) или candidateId (совпадение с кандидатом), либо оба поля null — процесс новый. В attachToProjectId укажи id проекта, куда отнести источник в целом (самое сильное совпадение), иначе null. Новые процессы добавь в newCandidates. Не создавай дубликаты похожих процессов. Отвечай СТРОГО JSON по схеме.`,
      },
      {
        role: "user",
        content: `ПРОЕКТЫ ОРГАНИЗАЦИИ:\n${
          projects.map((p) => `- [${p.id}] «${p.title}»: ${p.description || "без описания"}`).join("\n") || "(проектов нет)"
        }\n\nСУЩЕСТВУЮЩИЕ КАНДИДАТЫ (ожидают решения):\n${
          candidates.map((c) => `- [${c.id}] «${c.title}»`).join("\n") || "(кандидатов нет)"
        }\n\nПРОЦЕССЫ ИЗ ИНТЕРВЬЮ (${employeeName}):\n${summary.processes
          .map((p) => `- «${p.name}»: ${p.steps.length} шагов, боль: ${p.pain || "не озвучена"}`)
          .join("\n") || "(нет)"}`,
      },
    ],
    { schema: routingSchema, temperature: 0.1 },
  );

  const projectIds = new Set(projects.map((p) => p.id));
  const candidateIds = new Set(candidates.map((c) => c.id));
  const links: ProcessLink[] = [];
  const evidenceUpdates: { candidateId: string; item: EvidenceItem }[] = [];
  for (const m of routing.matches) {
    const link: ProcessLink = { process: m.process };
    if (m.projectId && projectIds.has(m.projectId)) link.projectId = m.projectId;
    if (m.candidateId && candidateIds.has(m.candidateId)) link.candidateId = m.candidateId;
    if (!link.projectId && !link.candidateId) continue; // битая ссылка или «не совпал»
    links.push(link);
    if (link.candidateId) {
      evidenceUpdates.push({
        candidateId: link.candidateId,
        item: { who: `${employeeName} (интервью)`, what: m.process, ref: "резюме интервью" },
      });
    }
  }

  let attach = routing.attachToProjectId && projectIds.has(routing.attachToProjectId)
    ? routing.attachToProjectId
    : null;
  if (!attach) attach = links.find((l) => l.projectId)?.projectId ?? null;

  return {
    attachToProjectId: attach,
    matchReason: routing.matchReason,
    links,
    evidenceUpdates,
    newCandidates: routing.newCandidates,
  };
}

async function createCandidate(
  orgId: string,
  title: string,
  description: string,
  origin: "interview" | "document",
  evidence: EvidenceItem[],
): Promise<boolean> {
  // Дедуп: против проектов и существующих proposed-кандидатов
  const [projects, existing] = await Promise.all([
    db.project.findMany({ where: { orgId }, select: { title: true } }),
    db.processCandidate.findMany({ where: { orgId, status: "proposed" }, select: { title: true } }),
  ]);
  const dup =
    projects.some((p) => titlesSimilar(p.title, title)) ||
    existing.some((c) => titlesSimilar(c.title, title));
  if (dup) return false;
  await db.processCandidate.create({
    data: { orgId, title, description, origin, evidence },
  });
  return true;
}

/**
 * Маршрутизация резюме интервью: к какому проекту организации отнести
 * источник и какие процессы — новые (→ кандидаты).
 *
 * Приоритет: явное назначение сотрудника владельцем (ProjectParticipant)
 * важнее LLM-маршрутизации — назначен в один проект → напрямую туда,
 * в несколько → LLM выбирает только среди назначенных.
 */
export async function routeInterview(
  orgId: string,
  userId: string,
  employeeName: string,
  summary: InterviewSummary,
): Promise<RouteResult> {
  // --- Приоритет 1: явные назначения участником проекта ---
  const assignedProjects = await db.project.findMany({
    where: { orgId, participants: { some: { userId } } },
    select: { id: true, title: true, description: true },
    orderBy: { createdAt: "desc" },
  });
  const projects = assignedProjects.length > 1 ? assignedProjects : await db.project.findMany({
    where: { orgId },
    select: { id: true, title: true, description: true },
    orderBy: { createdAt: "desc" },
  });
  const candidates = await db.processCandidate.findMany({
    where: { orgId, status: "proposed" },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });

  let match: ProcessMatchResult;
  try {
    match = await matchProcesses(employeeName, summary, projects, candidates);
  } catch {
    match = { attachToProjectId: null, links: [], evidenceUpdates: [], newCandidates: [] };
  }

  // Доказательства сматченных кандидатов: «кто ещё упомянул»
  for (const upd of match.evidenceUpdates) {
    const cand = await db.processCandidate.findUnique({ where: { id: upd.candidateId } });
    if (!cand) continue;
    const existing = (cand.evidence as EvidenceItem[] | null) ?? [];
    await db.processCandidate.update({
      where: { id: cand.id },
      data: { evidence: mergeEvidence(existing, [upd.item]) },
    });
  }

  let projectId: string;
  let reason: string;
  const target = assignedProjects.length === 1 ? assignedProjects[0] : match.attachToProjectId ? projects.find((p) => p.id === match.attachToProjectId) : undefined;
  if (target) {
    projectId = target.id;
    reason = match.matchReason ?? `Интервью ${employeeName}: процесс совпал с проектом «${target.title}»`;
  } else if (projects.length > 0) {
    // Процесс не опознан и проекты есть → источник в последний проект, процессы — в кандидаты
    projectId = projects[0].id;
    reason = "Источник добавлен в последний проект; новые процессы отправлены в кандидаты";
  } else {
    // Нет ни проектов, ни совпадений: создаём проект из первого процесса интервью
    const first = summary.processes[0];
    const project = await db.project.create({
      data: {
        orgId,
        title: first?.name?.slice(0, 200) ?? `Процесс: ${employeeName}`,
        description: first ? `Обнаружен в интервью ${employeeName}: ${first.pain}`.slice(0, 1000) : "",
        status: "capturing",
        origin: "auto_interview",
        autoReason: `Первый процесс организации, обнаружен в интервью ${employeeName}`,
      },
    });
    projectId = project.id;
    reason = "Создан автоматически: первый процесс, проектов не было";
  }

  // Новые процессы → кандидаты (кроме того, что ушёл в созданный проект)
  let created = 0;
  const unmatched = summary.processes
    .filter((p) => !match.links.some((l) => titlesSimilar(l.process, p.name)))
    .filter((p) => !match.newCandidates.some((c) => titlesSimilar(c.title, p.name)))
    .map((p) => ({ title: p.name, description: p.pain, reason: "Задача из интервью" }));
  for (const cand of [...match.newCandidates, ...unmatched]) {
    const evidence: EvidenceItem[] = [
      {
        who: `${employeeName} (интервью)`,
        what: cand.reason ?? `процесс «${cand.title}»`,
        ref: "резюме интервью",
      },
    ];
    if (await createCandidate(orgId, cand.title, cand.description ?? "", "interview", evidence)) created++;
    // Связь с только что созданным кандидатом тоже сохраняем
    const fresh = await db.processCandidate.findFirst({
      where: { orgId, title: cand.title, status: "proposed" },
      select: { id: true },
    });
    if (fresh) {
      const link = match.links.find((l) => l.process && titlesSimilar(l.process, cand.title));
      if (link) link.candidateId = fresh.id;
    }
  }

  return { projectId, createdCandidates: created, reason, processLinks: match.links };
}

/**
 * Детекция процесса в документе: если документ описывает процесс, не
 * совпадающий с проектом загрузки, создаём кандидата (origin=document).
 */
export async function detectDocumentProcess(
  orgId: string,
  projectId: string,
  projectTitle: string,
  docName: string,
  parsedJson: ParsedSource,
): Promise<number> {
  const detection = await chat(
    [
      {
        role: "system",
        content: `Ты — аналитик документации. Назови основные бизнес-процессы, которые описывает документ (короткие названия). Отвечай СТРОГО JSON по схеме.`,
      },
      {
        role: "user",
        content: `Документ: «${docName}»\nШаги: ${parsedJson.candidateSteps.map((s) => s.name).join("; ")}\nПравила: ${parsedJson.rules.map((r) => r.text).join("; ")}`,
      },
    ],
    { schema: docProcessDetectionSchema, temperature: 0.1 },
  ).catch(() => null);

  if (!detection) return 0;

  let created = 0;
  for (const name of detection.processNames) {
    // Расхождение с проектом загрузки → кандидат
    if (titlesSimilar(name, projectTitle)) continue;
    const evidence: EvidenceItem[] = [
      { who: `Документ «${docName}»`, what: name, ref: parsedJson.citations[0]?.ref ?? "" },
    ];
    if (await createCandidate(orgId, name, `Обнаружен в документе «${docName}», загруженном в проект «${projectTitle}»`, "document", evidence)) {
      created++;
    }
  }
  return created;
}

/** Валидация JSON карты. */
export function safeParseMap(json: unknown): ProcessMapJson | null {
  const res = processMapJsonSchema.safeParse(json);
  return res.success ? res.data : null;
}

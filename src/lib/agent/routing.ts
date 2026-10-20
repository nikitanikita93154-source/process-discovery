import { db } from "@/lib/db";
import { chat } from "@/lib/llm";
import {
  docProcessDetectionSchema,
  routingSchema,
  t1ClusteringSchema,
  type EvidenceItem,
  type Routing,
  type T1Clustering,
} from "@/lib/schemas/candidate";
import type { InterviewSummary } from "@/lib/schemas/test2";
import type { Test1Answers } from "@/lib/schemas/test1";
import { processMapJsonSchema, type ProcessMapJson } from "@/lib/schemas/map";
import type { ParsedSource } from "@/lib/schemas/source";

// ============================================================
// Маршрутизация обнаруженных процессов: интервью/анкеты →
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
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

/** Похожи ли два названия (частичное вхождение нормализованных форм). */
function titlesSimilar(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

async function createCandidate(
  orgId: string,
  title: string,
  description: string,
  origin: "interview" | "t1" | "document",
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
  if (assignedProjects.length === 1) {
    return {
      projectId: assignedProjects[0].id,
      createdCandidates: 0,
      reason: `Сотрудник назначен владельцем в проект «${assignedProjects[0].title}»`,
    };
  }

  const projects = assignedProjects.length > 1 ? assignedProjects : await db.project.findMany({
    where: { orgId },
    select: { id: true, title: true, description: true },
    orderBy: { createdAt: "desc" },
  });

  let routing: Routing;
  try {
    routing = await chat(
      [
        {
          role: "system",
          content: `Ты — диспетчер процессов. Соотнеси процессы из резюме интервью с существующими проектами организации. Если процесс по смыслу совпадает с проектом — верни attachToProjectId (id проекта). Если процесс новый (нет подходящего проекта) — верни null и добавь его в newCandidates с коротким описанием и причиной. Не создавай дубликаты похожих процессов. Отвечай СТРОГО JSON по схеме.`,
        },
        {
          role: "user",
          content: `ПРОЕКТЫ ОРГАНИЗАЦИИ:\n${
            projects.map((p) => `- [${p.id}] «${p.title}»: ${p.description || "без описания"}`).join("\n") || "(проектов нет)"
          }\n\nПРОЦЕССЫ ИЗ ИНТЕРВЬЮ (${employeeName}):\n${summary.processes
            .map((p) => `- «${p.name}»: ${p.steps.length} шагов, боль: ${p.pain}`)
            .join("\n") || "(нет)"}`,
        },
      ],
      { schema: routingSchema, temperature: 0.1 },
    );
  } catch {
    // Fallback без LLM: прежнее поведение — последний проект (или создаём под сотрудника)
    let project = projects[0];
    if (!project) {
      project = await db.project.create({
        data: {
          orgId,
          title: `Процесс: ${employeeName}`,
          description: `Автоматически создан по итогам интервью ${employeeName}`,
          status: "capturing",
          origin: "auto_interview",
          autoReason: "LLM-маршрутизация недоступна: создан fallback-проект для сохранения источника интервью",
        },
      });
    }
    return { projectId: project.id, createdCandidates: 0, reason: "fallback: без LLM-маршрутизации" };
  }

  // Валидация: attachToProjectId должен существовать в этой организации
  const target = routing.attachToProjectId
    ? projects.find((p) => p.id === routing.attachToProjectId)
    : undefined;

  let projectId: string;
  let reason: string;
  if (target) {
    projectId = target.id;
    reason = routing.matchReason ?? `Интервью ${employeeName}: процесс совпал с проектом «${target.title}»`;
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
  for (const cand of routing.newCandidates) {
    const evidence: EvidenceItem[] = [
      {
        who: `${employeeName} (интервью)`,
        what: cand.reason ?? `процесс «${cand.title}»`,
        ref: "резюме интервью",
      },
    ];
    if (await createCandidate(orgId, cand.title, cand.description ?? "", "interview", evidence)) created++;
  }

  return { projectId, createdCandidates: created, reason };
}

/**
 * Кластеризация задач Теста 1: поиск процессов-кандидатов по анкетам
 * всех сотрудников организации. Возвращает число созданных кандидатов.
 */
export async function discoverFromT1(orgId: string): Promise<{ created: number; clusters: number }> {
  const t1Rows = await db.test1Session.findMany({
    where: { status: "completed", user: { orgId } },
    include: { user: { select: { name: true } } },
  });
  const answers = t1Rows
    .map((r) => ({
      name: r.user.name,
      answers: r.answers as Test1Answers | null,
    }))
    .filter((r) => r.answers !== null);

  if (answers.length === 0) return { created: 0, clusters: 0 };

  const tasksDigest = answers.flatMap((a) =>
    (a.answers!.tasks ?? []).map((t) => ({
      who: a.name,
      title: t.title,
      frequency: t.frequency,
      duration: t.duration,
      irritation: t.irritation,
    })),
  );

  let clustering: T1Clustering;
  try {
    clustering = await chat(
      [
        {
          role: "system",
          content: `Ты — аналитик процессов. Сгруппируй задачи сотрудников в кластеры повторяющихся бизнес-процессов (один кластер = одна суть деятельности, разные формулировки — вместе). Объединяй только действительно похожее. В taskTitles перечисли исходные названия задач кластера. Кластеры из одной задачи тоже допустимы, если задача выглядит как самостоятельный процесс. Отвечай СТРОГО JSON по схеме.`,
        },
        {
          role: "user",
          content: `ЗАДАЧИ СОТРУДНИКОВ:\n${tasksDigest
            .map((t) => `- [${t.who}] ${t.title} (${t.frequency}, ${t.duration}, раздражение ${t.irritation}/5)`)
            .join("\n")}`,
        },
      ],
      { schema: t1ClusteringSchema, temperature: 0.2 },
    );
  } catch (e) {
    console.error("[discover-t1] LLM недоступен, детерминированная группировка:", e instanceof Error ? e.message : e);
    // Fallback без LLM: детерминированная группировка по точному совпадению названий
    const byTitle = new Map<string, { title: string; evidence: { who: string; what: string; ref: string }[] }>();
    for (const t of tasksDigest) {
      const key = norm(t.title);
      const entry = byTitle.get(key) ?? { title: t.title, evidence: [] };
      entry.evidence.push({ who: t.who, what: t.title, ref: `${t.frequency}, ${t.duration}` });
      byTitle.set(key, entry);
    }
    let created = 0;
    for (const { title, evidence } of byTitle.values()) {
      if (await createCandidate(orgId, title, "Группировка без LLM (точное совпадение названий)", "t1", evidence)) created++;
    }
    return { created, clusters: byTitle.size };
  }

  const taskToWho = new Map(tasksDigest.map((t) => [norm(t.title), t]));
  let created = 0;
  for (const cluster of clustering.clusters) {
    const evidence: EvidenceItem[] = cluster.taskTitles
      .map((title) => {
        const t = taskToWho.get(norm(title));
        return t
          ? { who: `${t.who} (Тест 1)`, what: t.title, ref: `${t.frequency}, ${t.duration}, раздражение ${t.irritation}/5` }
          : { who: "Тест 1", what: title };
      })
      .filter((e) => Boolean(e.what));
    if (evidence.length === 0) evidence.push({ who: "Тест 1", what: cluster.title, ref: cluster.reason });
    if (await createCandidate(orgId, cluster.title, cluster.description ?? "", "t1", evidence)) created++;
  }
  return { created, clusters: clustering.clusters.length };
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

/** Валидация JSON карты (переиспользуется панелью Т1). */
export function safeParseMap(json: unknown): ProcessMapJson | null {
  const res = processMapJsonSchema.safeParse(json);
  return res.success ? res.data : null;
}

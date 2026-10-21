/**
 * Разовый backfill: для проектов, созданных из кандидатов Теста 1 (origin=auto_t1),
 * создаёт источник «Анкеты Теста 1», если источников этого типа ещё нет.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

async function main() {
  const candidates = await db.processCandidate.findMany({
    where: { status: "accepted", origin: "t1" },
    include: { org: true },
  });

  for (const cand of candidates) {
    const projects = await db.project.findMany({ where: { orgId: cand.orgId } });
    const project = projects.find(
      (p) => norm(p.title) === norm(cand.title) || (norm(p.title).length >= 6 && norm(cand.title).includes(norm(p.title))),
    );
    if (!project) continue;

    const existing = await db.source.findFirst({
      where: { projectId: project.id, type: "test1" },
    });
    if (existing) continue;

    // Переиспользуем серверную логику через прямой вызов (скомпилированный модуль недоступен из скрипта — дублируем компактно)
    const names = Array.from(
      new Set(
        ((cand.evidence as { who?: string }[] | null) ?? [])
          .map((e) => (e.who ?? "").replace(/\s*\(Тест 1\)\s*/g, "").trim())
          .filter(Boolean),
      ),
    );
    if (names.length === 0) continue;
    const users = await db.user.findMany({
      where: { orgId: cand.orgId, name: { in: names } },
      include: { test1: true },
    });
    const answered = users.filter((u) => u.test1?.status === "completed" && u.test1.answers);
    if (answered.length === 0) continue;

    const evidenceWhats = ((cand.evidence as { what?: string }[] | null) ?? []).map((e) => norm(e.what ?? ""));
    const steps: { name: string; actor?: string; system?: string; frequency?: string; volume?: string; source?: string }[] = [];
    const actors = new Set<string>();
    const citations: { ref: string }[] = [];
    for (const u of answered) {
      const a = u.test1!.answers as {
        passport?: { position?: string; department?: string };
        tasks?: { title: string; frequency: string; duration: string; irritation: number; systems: string[] }[];
      };
      if (a.passport?.position) actors.add(a.passport.position);
      citations.push({ ref: `Тест 1: ${u.name} (${a.passport?.department ?? "—"})` });
      for (const t of a.tasks ?? []) {
        const mentioned =
          evidenceWhats.some((w) => w === norm(t.title) || (w.length >= 6 && norm(t.title).includes(w))) ||
          norm(t.title).includes(norm(cand.title)) ||
          norm(cand.title).includes(norm(t.title));
        if (!mentioned) continue;
        steps.push({
          name: t.title,
          actor: a.passport?.position,
          system: t.systems.join(", ") || undefined,
          frequency: t.frequency,
          volume: `${t.duration} на один раз, раздражение ${t.irritation}/5`,
          source: `Тест 1: ${u.name}`,
        });
      }
    }
    if (steps.length === 0) continue;

    await db.source.create({
      data: {
        projectId: project.id,
        type: "test1",
        name: `Анкеты Теста 1 (${answered.map((u) => u.name).join(", ")})`,
        status: "parsed",
        parsedJson: { candidateSteps: steps, actors: [...actors], rules: [], exceptions: [], citations },
      },
    });
    console.log(`✓ «${project.title}» ← анкеты (${answered.map((u) => u.name).join(", ")}, ${steps.length} шагов)`);
  }
  console.log("backfill завершён");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

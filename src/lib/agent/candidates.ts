import { db } from "@/lib/db";
import type { EvidenceItem } from "@/lib/schemas/candidate";
import type { ParsedSource } from "@/lib/schemas/source";
import type { Test1Answers } from "@/lib/schemas/test1";

// ============================================================
// Перенос доказательств Теста 1 в проект при принятии кандидата:
// анкеты упомянувших сотрудников → Source(type: test1).
// ============================================================

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

/**
 * Создаёт в проекте источник «Анкеты Теста 1» из задач сотрудников,
 * упомянутых в доказательствах кандидата. Возвращает id источника или null.
 */
export async function createT1SourceFromCandidate(
  orgId: string,
  projectId: string,
  candidateTitle: string,
  evidence: EvidenceItem[],
): Promise<string | null> {
  // Достаём имена сотрудников из evidence.who («Марина Ким (Тест 1)» → «Марина Ким»)
  const names = Array.from(
    new Set(evidence.map((e) => e.who.replace(/\s*\(Тест 1\)\s*/g, "").replace(/\s*\(анкета[^)]*\)\s*/g, "").trim()).filter(Boolean)),
  );
  if (names.length === 0) return null;

  const users = await db.user.findMany({
    where: { orgId, name: { in: names } },
    include: { test1: true },
  });
  const answered = users.filter((u) => u.test1?.status === "completed" && u.test1.answers);
  if (answered.length === 0) return null;

  // Задачи анкет, упомянутые в доказательствах (или все задачи этих сотрудников)
  const evidenceWhats = evidence.map((e) => norm(e.what));
  const candidateSteps: ParsedSource["candidateSteps"] = [];
  const actors = new Set<string>();
  const citations: ParsedSource["citations"] = [];

  for (const u of answered) {
    const answers = u.test1!.answers as Test1Answers;
    actors.add(answers.passport?.position ?? "Сотрудник");
    citations.push({ ref: `Тест 1: ${u.name} (${answers.passport?.department ?? "—"})` });
    for (const task of answers.tasks ?? []) {
      const mentioned =
        evidenceWhats.some((w) => w === norm(task.title) || (w.length >= 6 && norm(task.title).includes(w)) || (norm(task.title).length >= 6 && w.includes(norm(task.title)))) ||
        norm(task.title).includes(norm(candidateTitle)) ||
        norm(candidateTitle).includes(norm(task.title));
      if (!mentioned) continue;
      candidateSteps.push({
        name: task.title,
        actor: answers.passport?.position,
        system: task.systems.join(", ") || undefined,
        frequency: task.frequency,
        volume: `${task.duration} на один раз, раздражение ${task.irritation}/5`,
        source: `Тест 1: ${u.name}`,
      });
    }
  }

  if (candidateSteps.length === 0) return null;

  const source = await db.source.create({
    data: {
      projectId,
      type: "test1",
      name: `Анкеты Теста 1 (${answered.map((u) => u.name).join(", ")})`,
      status: "parsed",
      parsedJson: {
        candidateSteps,
        actors: [...actors],
        rules: [],
        exceptions: [],
        citations,
      } satisfies ParsedSource,
    },
  });
  return source.id;
}

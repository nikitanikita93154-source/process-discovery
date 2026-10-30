import { titlesSimilar } from "@/lib/agent/routing";
import { parsedSourceSchema } from "@/lib/schemas/source";

// ============================================================
// Сотрудники, описавшие процесс проекта: источники-интервью
// самого проекта + интервью организации, в резюме которых есть
// совпадающий по названию процесс (интервью может описывать
// несколько процессов, а источник привязан к одному проекту).
// ============================================================

export interface InterviewSourceRow {
  id: string;
  name: string;
  projectId: string;
  parsedJson: unknown;
}

/** Имена сотрудников, чьи интервью описали процесс проекта. */
export function employeesForProject(
  projectId: string,
  projectTitle: string,
  sources: InterviewSourceRow[],
): string[] {
  const names = new Set<string>();
  for (const row of contributingInterviews(projectId, projectTitle, sources, {})) {
    names.add(row.employeeName);
  }
  return [...names].sort();
}

/** Вклад интервью в проект — для плашки «Из чьих интервью берётся процесс». */
export interface ContributingInterview {
  employeeName: string;
  sourceId: string;
  /** Источник лежит в самом проекте. */
  direct: boolean;
  /** Проект, где физически лежит источник (если не в этом). */
  hostProjectTitle?: string;
  /** Процесс сотрудника, связанный с проектом (связка или строковое совпадение). */
  matchedProcess?: string;
}

/**
 * Все интервью, из которых берётся процесс проекта: прямые источники
 * проекта + интервью организации с семантической связкой или совпадающим
 * процессом в резюме (источник может лежать в другом проекте).
 */
export function contributingInterviews(
  projectId: string,
  projectTitle: string,
  sources: InterviewSourceRow[],
  hostTitles: Record<string, string>,
): ContributingInterview[] {
  const rows: ContributingInterview[] = [];
  for (const s of sources) {
    const parsed = parsedSourceSchema.safeParse(s.parsedJson);
    if (!parsed.success) continue;
    const interview = parsed.data.interview;
    const employee = interview?.employeeName ?? s.name.replace(/^Интервью — /u, "").trim();
    if (!employee) continue;

    const direct = s.projectId === projectId;
    const linkedProcess =
      (interview?.processLinks ?? []).find((l) => l.projectId === projectId)?.process ?? null;
    const mentionedProcess =
      (interview?.summary?.processes ?? []).find((p) => titlesSimilar(p.name, projectTitle))?.name ?? null;
    if (!direct && !linkedProcess && !mentionedProcess) continue;

    rows.push({
      employeeName: employee,
      sourceId: s.id,
      direct,
      hostProjectTitle: direct ? undefined : (hostTitles[s.projectId] ?? ""),
      matchedProcess: linkedProcess ?? mentionedProcess ?? undefined,
    });
  }
  return rows.sort((a, b) => Number(b.direct) - Number(a.direct) || a.employeeName.localeCompare(b.employeeName));
}

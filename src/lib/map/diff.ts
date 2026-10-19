import type { ProcessMapJson } from "@/lib/schemas/map";

// ============================================================
// Diff двух версий карты: добавленные/удалённые/изменённые шаги.
// ============================================================

export interface MapDiffEntry {
  kind: "added" | "removed" | "changed";
  stage: string;
  step: string;
  details: string;
}

export function diffMaps(oldMap: ProcessMapJson, newMap: ProcessMapJson): MapDiffEntry[] {
  const entries: MapDiffEntry[] = [];

  const oldSteps = new Map<string, { stage: string; actor: string; system: string }>();
  for (const stage of oldMap.stages) {
    for (const step of stage.steps) {
      oldSteps.set(step.name, { stage: stage.name, actor: step.actor, system: step.system });
    }
  }

  const newSteps = new Map<string, { stage: string; actor: string; system: string }>();
  for (const stage of newMap.stages) {
    for (const step of stage.steps) {
      newSteps.set(step.name, { stage: stage.name, actor: step.actor, system: step.system });
    }
  }

  for (const [name, info] of newSteps) {
    const old = oldSteps.get(name);
    if (!old) {
      entries.push({ kind: "added", stage: info.stage, step: name, details: `новый шаг в «${info.stage}»` });
    } else {
      const changes: string[] = [];
      if (old.actor !== info.actor) changes.push(`актор: «${old.actor}» → «${info.actor}»`);
      if (old.system !== info.system) changes.push(`система: «${old.system}» → «${info.system}»`);
      if (changes.length > 0) {
        entries.push({ kind: "changed", stage: info.stage, step: name, details: changes.join("; ") });
      }
    }
  }

  for (const [name, info] of oldSteps) {
    if (!newSteps.has(name)) {
      entries.push({ kind: "removed", stage: info.stage, step: name, details: `шаг удалён из «${info.stage}»` });
    }
  }

  return entries;
}

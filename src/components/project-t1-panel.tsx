import { ru } from "@/lib/content/ru";

// ============================================================
// Панель «Что говорят анкеты (Тест 1)» на вкладке Источники:
// задачи сотрудников, совпадающие с шагами проекта (детерминированно,
// без LLM — нормализованный матчинг названий).
// ============================================================

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");

export interface T1Mention {
  employee: string;
  department: string;
  task: string;
  frequency: string;
  duration: string;
  irritation: number;
}

export function ProjectT1Panel({ mentions }: { mentions: T1Mention[] }) {
  if (mentions.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <h3 className="font-semibold text-blue-800">{ru.t1Panel.title}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">{ru.t1Panel.hint}</p>
      <ul className="mt-3 space-y-1.5">
        {mentions.map((m, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
            <span className="font-medium">{m.employee}</span>
            <span className="text-xs text-zinc-400">{m.department}</span>
            <span className="text-zinc-700">— {m.task}</span>
            <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5">{m.frequency}</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5">{m.duration}</span>
              <span
                className={`rounded px-1.5 py-0.5 ${
                  m.irritation >= 4 ? "bg-red-100 text-red-700" : "bg-zinc-100"
                }`}
              >
                {ru.t1Panel.irritation} {m.irritation}/5
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Матчит задачи Т1 организации к названиям шагов проекта. */
export function matchT1ToSteps(
  t1Answers: { name: string; department: string; tasks: { title: string; frequency: string; duration: string; irritation: number }[] }[],
  stepNames: string[],
): T1Mention[] {
  const normalizedSteps = stepNames.map((s) => norm(s)).filter((s) => s.length > 0);
  const matches: T1Mention[] = [];
  for (const employee of t1Answers) {
    for (const task of employee.tasks) {
      const nt = norm(task.title);
      const hit = normalizedSteps.some(
        (ns) => ns === nt || (nt.length >= 6 && ns.length >= 6 && (ns.includes(nt) || nt.includes(ns))),
      );
      if (hit) {
        matches.push({
          employee: employee.name,
          department: employee.department,
          task: task.title,
          frequency: task.frequency,
          duration: task.duration,
          irritation: task.irritation,
        });
      }
    }
  }
  return matches;
}

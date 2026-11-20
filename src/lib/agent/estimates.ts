import type { Fact } from "@/lib/schemas/interview";

function period(text: string) {
  if (/ежеднев|(?:в|за|на) (?:рабочий )?день|в сутки/iu.test(text)) return "day";
  if (/еженедел|(?:в|за|на) неделю/iu.test(text)) return "week";
  if (/ежемесяч|(?:в|за|на) месяц/iu.test(text)) return "month";
}

function interval(raw: string, time: boolean): [number, number] | undefined {
  const text = raw.toLowerCase().replace(/,/g, ".").replace(/полчаса/gu, "30 минут")
    .replace(/(?<![\d\p{L}])(?:около |примерно )?час(?:а)?(?=\s|$)/gu, (match, offset) =>
      /\d\s*$/u.test(raw.slice(0, offset)) ? match : "1 час");
  const match = /(\d+(?:\.\d+)?)(?:\s*[-–—]\s*(\d+(?:\.\d+)?))?\s*(минут[а-я]*|мин\.?|час[а-я]*|ч\.?)?/iu.exec(text);
  if (!match || (time && !match[3]) || /\d/u.test(text.slice(match.index + match[0].length))) return;
  const factor = time && match[3]?.startsWith("ч") ? 60 : 1;
  const low = Number(match[1]) * factor;
  const high = Number(match[2] ?? match[1]) * factor;
  if (low > 0 && high >= low) return [low, high];
}

export function inconsistentEstimate(fact: Fact, statement = "") {
  if (fact.type !== "task" || !fact.volume || !fact.duration || !fact.total_time) return false;
  const volumePeriod = period(fact.volume) ?? period(fact.frequency ?? "");
  const totalPeriod = period(fact.total_time) ?? (statement.includes(fact.volume) &&
    statement.includes(fact.duration) && statement.includes(fact.total_time) && /всего|суммарно|итого/iu.test(statement) ? period(statement) : undefined);
  if (!volumePeriod || volumePeriod !== totalPeriod) return false;
  const count = interval(fact.volume, false);
  const duration = interval(fact.duration, true);
  const total = interval(fact.total_time, true);
  if (!count || !duration || !total) return false;
  const approximate = /около|примерно|приблизительно|порядка|~/iu.test([fact.volume, fact.duration, fact.total_time].join(" "));
  const tolerance = approximate ? 0.25 : 0;
  return count[0] * duration[0] > total[1] * (1 + tolerance)
    || count[1] * duration[1] < total[0] * (1 - tolerance);
}

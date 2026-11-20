import { describe, expect, it } from "vitest";
import { inconsistentEstimate } from "./estimates";
import type { Fact } from "@/lib/schemas/interview";

const task: Fact = { name: "Документы", type: "task", source: "msg#1",
  volume: "20 документов в день", duration: "5 минут", total_time: "около часа в день" };

describe("оценки одной задачи", () => {
  it("сопоставляет минуты, часы и общий период из одной реплики", () => {
    expect(inconsistentEstimate(task)).toBe(true);
    expect(inconsistentEstimate({ ...task, total_time: "около часа" },
      "20 документов в день, по 5 минут, всего около часа")).toBe(true);
  });
  it.each([
    { total_time: "час в неделю" }, { total_time: "час" }, { volume: undefined },
    { duration: "3–5 минут" }, { volume: "10–20 документов в день" },
    { volume: "15 документов в день" }, { duration: "не помню" },
  ])("не уточняет при пересечении интервалов, допустимом округлении или разных периодах: %j", (update) => {
    expect(inconsistentEstimate({ ...task, ...update })).toBe(false);
  });
});

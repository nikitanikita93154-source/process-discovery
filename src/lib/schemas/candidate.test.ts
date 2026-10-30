import { describe, expect, it } from "vitest";
import { mergeEvidence, routingSchema, type EvidenceItem } from "@/lib/schemas/candidate";

describe("mergeEvidence", () => {
  it("дописывает новые записи и дедуплит по (who, what)", () => {
    const existing: EvidenceItem[] = [
      { who: "Вера Козлова (интервью)", what: "внесение в CRM", ref: "резюме интервью" },
    ];
    const merged = mergeEvidence(existing, [
      { who: "Анна Смирнова (интервью)", what: "занесение результатов звонков", ref: "резюме интервью" },
      { who: "Вера Козлова (интервью)", what: "внесение в CRM" }, // дубль (без ref)
      { who: "ВЕРА Козлова (интервью)", what: "Внесение в CRM" }, // дубль по регистру
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[1].who).toBe("Анна Смирнова (интервью)");
  });

  it("не мутирует исходный массив", () => {
    const existing: EvidenceItem[] = [{ who: "A", what: "x" }];
    mergeEvidence(existing, [{ who: "B", what: "y" }]);
    expect(existing).toHaveLength(1);
  });
});

describe("routingSchema", () => {
  it("matches по умолчанию пустой, парсится с projectId/candidateId", () => {
    const empty = routingSchema.parse({ attachToProjectId: null, newCandidates: [] });
    expect(empty.matches).toEqual([]);

    const full = routingSchema.parse({
      attachToProjectId: "p1",
      matches: [
        { process: "Занесение результатов в CRM", candidateId: "c1" },
        { process: "Рассылка писем", projectId: "p2" },
        { process: "Совсем новый процесс" },
      ],
      newCandidates: [],
    });
    expect(full.matches).toHaveLength(3);
    expect(full.matches[0].candidateId).toBe("c1");
    expect(full.matches[2].projectId).toBeUndefined();
  });
});

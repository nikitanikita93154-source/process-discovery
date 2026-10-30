import { describe, expect, it } from "vitest";
import { loadInterviewState, sessionSnapshot, type InterviewSessionRow } from "@/lib/agent/session";
import { TOPIC_SUMMARY } from "@/lib/agent/agenda";

const baseRow: InterviewSessionRow = {
  id: "s1",
  userId: "u1",
  status: "in_progress",
  startedAt: new Date("2026-01-01T00:00:00Z"),
  agenda: ["Тема A", "Тема B", TOPIC_SUMMARY],
  coverage: { topics: { "Тема A": "open", "Тема B": "covered", [TOPIC_SUMMARY]: "open" }, followUps: 1 },
  transcript: [{ role: "user", text: "привет", ts: "2026-01-01T00:00:01Z", topic: "Тема A" }],
  facts: [{ type: "task", name: "Задача", source: "msg#1" }],
  summary: null,
};

describe("loadInterviewState", () => {
  it("восстанавливает состояние с zod-валидацией", () => {
    const st = loadInterviewState(baseRow, "Иван");
    expect(st.sessionId).toBe("s1");
    expect(st.employeeName).toBe("Иван");
    expect(st.coverage.followUps).toBe(1);
    expect(st.transcript[0]).toMatchObject({ role: "user", text: "привет" });
    expect(st.facts[0]).toMatchObject({ type: "task" });
  });

  it("дефолты для пустых JSON-полей", () => {
    const st = loadInterviewState(
      { ...baseRow, agenda: null, coverage: null, transcript: null, facts: null },
      "Иван",
    );
    expect(st.agenda).toEqual([]);
    expect(st.coverage).toEqual({ topics: {}, followUps: 0, vetoCount: 0 });
    expect(st.transcript).toEqual([]);
    expect(st.facts).toEqual([]);
  });

  it("резюме парсится со схемой: volume/pain подставляются пустыми строками", () => {
    const st = loadInterviewState(
      { ...baseRow, summary: { processes: [{ name: "Процесс" }] } },
      "Иван",
    );
    expect(st.summary?.processes[0]).toMatchObject({
      name: "Процесс",
      steps: [],
      volume: "",
      pain: "",
    });
  });

  it("бросает ошибку на невалидном транскрипте", () => {
    expect(() =>
      loadInterviewState({ ...baseRow, transcript: [{ role: "hacker", text: "x", ts: "t" }] }, "Иван"),
    ).toThrow();
  });
});

describe("sessionSnapshot", () => {
  it("указывает первую открытую тему и прогресс", () => {
    const st = loadInterviewState(baseRow, "Иван");
    const snap = sessionSnapshot(st);
    expect(snap.currentTopic).toBe("Тема A");
    expect(snap.topicNumber).toBe(1);
    expect(snap.topicsTotal).toBe(3);
    expect(snap.sessionId).toBe("s1");
    expect(snap.limitMs).toBeGreaterThan(0);
  });

  it("когда всё закрыто — текущая тема резюме", () => {
    const row: InterviewSessionRow = {
      ...baseRow,
      coverage: { topics: { "Тема A": "covered", "Тема B": "skipped", [TOPIC_SUMMARY]: "open" }, followUps: 0 },
    };
    const snap = sessionSnapshot(loadInterviewState(row, "Иван"));
    expect(snap.currentTopic).toBe(TOPIC_SUMMARY);
    expect(snap.topicNumber).toBe(3);
  });
});

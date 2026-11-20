import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/guards", () => ({ requireApiUser: vi.fn().mockResolvedValue({ id: "u1", orgId: "o1", role: "EMPLOYEE" }) }));
vi.mock("@/lib/db", () => ({ db: { interviewSession: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } } }));
vi.mock("@/lib/agent/interview", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/agent/interview")>()), agentTurn: vi.fn() }));

import { db } from "@/lib/db";
import { agentTurn } from "@/lib/agent/interview";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

it("отклоняет команду досрочного завершения до изменения интервью", async () => {
  const response = await POST(new Request("http://localhost/api/interview/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "STOP" }) }));
  expect(response.status).toBe(422);
  expect(db.interviewSession.findFirst).not.toHaveBeenCalled();
  expect(db.interviewSession.create).not.toHaveBeenCalled();
});

it("не создаёт новое интервью после завершения, даже с прямым запросом", async () => {
  vi.mocked(db.interviewSession.findFirst).mockResolvedValue({ id: "completed" } as never);
  const response = await POST(new Request("http://localhost/api/interview/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  expect(response.status).toBe(400);
  expect(db.interviewSession.create).not.toHaveBeenCalled();
});

it("сохраняет приветствие с первым вопросом и не повторяет его при следующем ходе", async () => {
  const row = { id: "s1", userId: "u1", status: "in_progress", projectId: null, startedAt: new Date(), agenda: ["Тема"], coverage: { topics: { Тема: "open" }, followUps: 0 }, transcript: [], facts: [], summary: null };
  vi.mocked(db.interviewSession.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(row as never);
  vi.mocked(agentTurn).mockImplementation(async (state) => {
    const turn = { message: "Как устроена ваша работа?", extracted_facts: [], next_action: "ask" as const };
    return { turn, state: { ...state, transcript: [...state.transcript, { role: "assistant", text: turn.message, ts: new Date().toISOString() }] } };
  });
  const request = (body: object) => new Request("http://localhost/api/interview/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const first = await POST(request({ sessionId: "s1" }));
  const stream = await first.text();
  expect(stream).toContain("Здравствуйте! Это чат для интервью");
  expect(stream).toContain("Как устроена ваша работа?");
  const stored = vi.mocked(db.interviewSession.updateMany).mock.calls.at(-1)?.[0].data.transcript as typeof row.transcript;
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ role: "assistant", text: expect.stringContaining("Здравствуйте!") });

  vi.mocked(db.interviewSession.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...row, transcript: stored } as never);
  const next = await POST(request({ sessionId: "s1", message: "Готовлю отчёты" }));
  expect(await next.text()).not.toContain("Здравствуйте!");
});

it("не запускает два параллельных хода одного сотрудника", async () => {
  const row = { id: "s1", userId: "u1", status: "in_progress", projectId: null, startedAt: new Date(), agenda: ["Тема"], coverage: { topics: { Тема: "open" }, followUps: 0 }, transcript: [], facts: [], summary: null };
  vi.mocked(db.interviewSession.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(row as never);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.mocked(agentTurn).mockImplementationOnce(async (state) => {
    await gate;
    const turn = { message: "Вопрос?", extracted_facts: [], next_action: "ask" as const };
    return { turn, state: { ...state, transcript: [{ role: "assistant", text: turn.message, ts: new Date().toISOString() }] } };
  });
  const request = () => new Request("http://localhost/api/interview/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "s1" }) });
  const first = await POST(request());
  const duplicate = await POST(request());
  expect(duplicate.status).toBe(409);
  release();
  await first.text();
  expect(agentTurn).toHaveBeenCalledTimes(1);
});

it("не перезаписывает состояние, изменённое другим запросом", async () => {
  const row = { id: "s1", userId: "u1", status: "in_progress", projectId: null, startedAt: new Date(), agenda: ["Тема"], coverage: { topics: { Тема: "open" }, followUps: 0 }, transcript: [], facts: [], summary: null };
  vi.mocked(db.interviewSession.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(row as never);
  vi.mocked(db.interviewSession.updateMany).mockResolvedValueOnce({ count: 0 });
  const response = await POST(new Request("http://localhost/api/interview/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "s1", message: "Ответ" }) }));
  expect(await response.text()).toContain("event: error");
  expect(agentTurn).not.toHaveBeenCalled();
  expect(db.interviewSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1", transcript: { equals: [] } } }));
});

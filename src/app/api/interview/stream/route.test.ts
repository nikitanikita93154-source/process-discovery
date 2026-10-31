import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/guards", () => ({ requireApiUser: vi.fn().mockResolvedValue({ id: "u1", orgId: "o1", role: "EMPLOYEE" }) }));
vi.mock("@/lib/db", () => ({ db: { interviewSession: { findFirst: vi.fn(), create: vi.fn() } } }));

import { db } from "@/lib/db";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

it("не создаёт новое интервью после завершения, даже с прямым запросом", async () => {
  vi.mocked(db.interviewSession.findFirst).mockResolvedValue({ id: "completed" } as never);
  const response = await POST(new Request("http://localhost/api/interview/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  expect(response.status).toBe(400);
  expect(db.interviewSession.create).not.toHaveBeenCalled();
});

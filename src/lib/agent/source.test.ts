import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { interviewSession: { findUnique: vi.fn(), updateMany: vi.fn() }, user: { findUnique: vi.fn() }, project: { findFirst: vi.fn() }, $transaction: vi.fn() } }));
vi.mock("@/lib/agent/routing", () => ({ routeInterview: vi.fn() }));

import { db } from "@/lib/db";
import { routeInterview } from "@/lib/agent/routing";
import { completeInterview } from "@/lib/agent/source";
import type { InterviewState } from "@/lib/agent/interview";

beforeEach(() => { vi.clearAllMocks(); });

describe("финализация интервью", () => {
  it("при сбое маршрутизации не отмечает интервью завершённым", async () => {
    vi.mocked(db.interviewSession.findUnique).mockResolvedValue({ status: "awaiting_confirmation", projectId: null } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({ orgId: "org" } as never);
    vi.mocked(routeInterview).mockRejectedValue(new Error("routing failed"));
    const state = { sessionId: "s", userId: "u", employeeName: "Имя", summary: { processes: [], open_questions: [] } } as unknown as InterviewState;
    await expect(completeInterview(state)).rejects.toThrow("routing failed");
    expect(db.interviewSession.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

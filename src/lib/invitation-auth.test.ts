import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { organization: { findUnique: vi.fn() }, user: { findUnique: vi.fn(), create: vi.fn() } } }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("random-hash") } }));

import { db } from "@/lib/db";
import { authenticateInvitation } from "@/lib/invitation-auth";

const org = vi.mocked(db.organization.findUnique);
const findUser = vi.mocked(db.user.findUnique);
const createUser = vi.mocked(db.user.create);
const input = { name: "Анна Иванова", email: " Anna@Example.com ", inviteCode: "PD-123" };
const employee = { id: "u1", orgId: "o1", email: "anna@example.com", name: "Анна Иванова", role: "EMPLOYEE", passwordHash: "hash", createdAt: new Date() };

beforeEach(() => { vi.clearAllMocks(); org.mockResolvedValue({ id: "o1" } as never); });

describe("вход по приглашению", () => {
  it("создаёт сотрудника с нормализованным email", async () => {
    findUser.mockResolvedValue(null);
    createUser.mockResolvedValue(employee);
    expect(await authenticateInvitation(input)).toMatchObject({ id: "u1", email: "anna@example.com", orgId: "o1" });
    expect(createUser).toHaveBeenCalledOnce();
  });
  it("восстанавливает существующего сотрудника той же организации", async () => {
    findUser.mockResolvedValue(employee);
    expect(await authenticateInvitation(input)).toMatchObject({ id: "u1" });
    expect(createUser).not.toHaveBeenCalled();
  });
  it("не открывает аккаунт владельца или сотрудника другой организации", async () => {
    findUser.mockResolvedValueOnce({ ...employee, role: "OWNER" }).mockResolvedValueOnce({ ...employee, orgId: "other" });
    expect(await authenticateInvitation(input)).toBeNull();
    expect(await authenticateInvitation(input)).toBeNull();
  });
  it("отклоняет неверную ссылку и некорректный email", async () => {
    org.mockResolvedValue(null);
    expect(await authenticateInvitation(input)).toBeNull();
    expect(await authenticateInvitation({ ...input, email: "нет" })).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });
});

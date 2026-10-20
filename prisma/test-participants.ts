/**
 * Тест приоритета назначений участников над LLM-маршрутизацией.
 * LLM не настроен на быстрый ответ — приоритетный путь должен сработать без него.
 */
import { PrismaClient } from "@prisma/client";
import { routeInterview } from "../src/lib/agent/routing";

const db = new PrismaClient();

async function main() {
  const org = await db.organization.findUnique({ where: { inviteCode: "PD-VECTOR" } });
  if (!org) throw new Error("Vector org not found");
  const marina = await db.user.findUnique({ where: { email: "marina@vector.io" } });
  if (!marina) throw new Error("Marina not found");
  const projects = await db.project.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } });
  console.log("проекты Vector:", projects.map((p) => `${p.title.slice(0, 30)} (${p.id.slice(-6)})`).join(" | "));

  // --- Кейс 1: без назначений → fallback (последний проект, LLM недоступен) ---
  await db.projectParticipant.deleteMany({ where: { userId: marina.id } });
  const noAssign = await routeInterview(org.id, marina.id, "Марина Ким", {
    processes: [{ name: "Тестовый процесс", steps: [], actors: [], systems: [], volume: "", pain: "" }],
    open_questions: [],
  });
  console.log("кейс 1 (нет назначений):", noAssign.projectId.slice(-6), "—", noAssign.reason.slice(0, 60));

  // --- Кейс 2: одно назначение → напрямую в него, БЕЗ LLM ---
  await db.projectParticipant.create({ data: { projectId: projects[0].id, userId: marina.id } });
  const oneAssign = await routeInterview(org.id, marina.id, "Марина Ким", {
    processes: [{ name: "Совсем другой процесс", steps: [], actors: [], systems: [], volume: "", pain: "" }],
    open_questions: [],
  });
  const ok2 = oneAssign.projectId === projects[0].id;
  console.log(
    "кейс 2 (одно назначение):", oneAssign.projectId.slice(-6), "ожидалось", projects[0].id.slice(-6),
    "→", ok2 ? "OK ✓" : "FAIL",
    "—", oneAssign.reason.slice(0, 60),
  );

  // --- Кейс 3: два назначения → fallback выбирает из назначенных (LLM недоступен) ---
  const tempProject = await db.project.create({
    data: { orgId: org.id, title: "Временный проект для теста", status: "draft" },
  });
  await db.projectParticipant.create({ data: { projectId: tempProject.id, userId: marina.id } });
  const twoAssign = await routeInterview(org.id, marina.id, "Марина Ким", {
    processes: [{ name: "Ещё один процесс", steps: [], actors: [], systems: [], volume: "", pain: "" }],
    open_questions: [],
  });
  const assignedIds = [projects[0].id, tempProject.id];
  const ok3 = assignedIds.includes(twoAssign.projectId);
  console.log(
    "кейс 3 (два назначения):", twoAssign.projectId.slice(-6),
    "допустимо:", assignedIds.map((i) => i.slice(-6)).join("/"),
    "→", ok3 ? "OK ✓" : "FAIL",
  );
  await db.project.delete({ where: { id: tempProject.id } });

  // Итог: Марина назначена участником основного проекта
  await db.projectParticipant.deleteMany({ where: { userId: marina.id } });
  await db.projectParticipant.create({ data: { projectId: projects[0].id, userId: marina.id } });
  console.log("итог: Марина назначена участником проекта «", projects[0].title, "»");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

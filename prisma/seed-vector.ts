/**
 * Демо-организация №2: «ООО Вектор Логистик».
 * Владелец + 3 сотрудника с заполненным Тестом 1 (разной полноты).
 * Тест 2 проводится live через SSE с Ollama (не в этом скрипте).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEPARTMENT_DEFAULTS, type Test1Answers } from "../src/lib/schemas/test1";

const db = new PrismaClient();

const t1 = (over: Partial<Test1Answers>): Test1Answers => ({
  passport: { position: "Специалист", department: "Операции", experience: "1–3 года" },
  tasks: [
    {
      title: "Обработка входящих заявок на доставку",
      frequency: "несколько раз в день",
      duration: "15–60 мин",
      systems: ["почта", "Excel"],
      irritation: 4,
      regulated: "нет",
    },
  ],
  expectations: { waitingFrequency: 4, waitingFor: "подтверждения от склада", behaviorWhileWaiting: "переключаюсь на другое" },
  mistakes: { tasksWithErrors: "оформление накладных", errorFrequency: "несколько раз в неделю", causes: ["чужие ошибки", "нет данных"] },
  gutDecisions: { hasGutDecisions: true, example: "выбираю перевозчика по опыту, без сравнения цен" },
  templateTexts: { frequency: "постоянно", example: "письмо-уведомление клиенту о доставке" },
  aiAttitude: { attitudeScore: 4, fears: ["ошибки"], genieTask: "уведомления клиентам" },
  openQuestion: { wasteOfTime: "перенос заявок из почты в Excel" },
  ...over,
});

async function main() {
  const orgName = "ООО Вектор Логистик";
  const inviteCode = "PD-VECTOR";

  // чистим, если уже создавали
  const old = await db.organization.findUnique({ where: { inviteCode } });
  if (old) {
    const users = await db.user.findMany({ where: { orgId: old.id }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.$transaction([
      db.analysisReport.deleteMany({ where: { map: { project: { orgId: old.id } } } }),
      db.followUpQuestion.deleteMany({ where: { project: { orgId: old.id } } }),
      db.comment.deleteMany({ where: { map: { project: { orgId: old.id } } } }),
      db.processMap.deleteMany({ where: { project: { orgId: old.id } } }),
      db.conflict.deleteMany({ where: { project: { orgId: old.id } } }),
      db.source.deleteMany({ where: { project: { orgId: old.id } } }),
      db.interviewSession.deleteMany({ where: { userId: { in: ids } } }),
      db.test1Session.deleteMany({ where: { userId: { in: ids } } }),
      db.project.deleteMany({ where: { orgId: old.id } }),
      db.user.deleteMany({ where: { orgId: old.id } }),
      db.organization.delete({ where: { id: old.id } }),
    ]);
  }

  const passwordHash = await bcrypt.hash("vector1234", 10);
  const org = await db.organization.create({
    data: { name: orgName, inviteCode, hourlyRate: 60, departments: [...DEPARTMENT_DEFAULTS] },
  });

  const owner = await db.user.create({
    data: { orgId: org.id, email: "owner@vector.io", name: "Игорь Векторный", role: "OWNER", passwordHash },
  });
  await db.test1Session.create({ data: { userId: owner.id, status: "not_started" } });

  const employees: { email: string; name: string; answers: Test1Answers; daysAgo: number }[] = [
    {
      email: "marina@vector.io",
      name: "Марина Ким",
      daysAgo: 2,
      answers: t1({
        passport: { position: "Логист", department: "Логистика", experience: "3+ лет" },
        tasks: [
          {
            title: "Обработка входящих заявок на доставку",
            frequency: "несколько раз в день",
            duration: "15–60 мин",
            systems: ["почта", "Excel", "мессенджеры"],
            irritation: 5,
            regulated: "нет",
          },
          {
            title: "Распределение заказов по перевозчикам",
            frequency: "раз в день",
            duration: ">60 мин",
            systems: ["Excel", "почта"],
            irritation: 4,
            regulated: "нет",
          },
        ],
        aiAttitude: { attitudeScore: 5, fears: ["ничего не боюсь"], genieTask: "автоматический выбор перевозчика по цене и рейтингу" },
      }),
    },
    {
      email: "oleg@vector.io",
      name: "Олег Тарасов",
      daysAgo: 1,
      answers: t1({
        passport: { position: "Кладовщик", department: "Операции", experience: "6–12 мес" },
        tasks: [
          {
            title: "Сборка заказа по накладной",
            frequency: "несколько раз в день",
            duration: "15–60 мин",
            systems: ["1С", "бумага"],
            irritation: 3,
            regulated: "да",
          },
        ],
        mistakes: { tasksWithErrors: "пересорт при сборке", errorFrequency: "раз в неделю", causes: ["человеческий фактор"] },
        gutDecisions: { hasGutDecisions: false },
        templateTexts: { frequency: "нет" },
        aiAttitude: { attitudeScore: 3, fears: ["заменят", "сложно"], genieTask: "проверка накладных" },
      }),
    },
    {
      email: "sveta@vector.io",
      name: "Света Орлова",
      daysAgo: 0,
      answers: t1({
        passport: { position: "Менеджер по продажам", department: "Продажи", experience: "1–3 года" },
        tasks: [
          {
            title: "Выставление счетов клиентам",
            frequency: "несколько раз в день",
            duration: "5–15 мин",
            systems: ["1С", "почта", "CRM"],
            irritation: 4,
            regulated: "да",
          },
          {
            title: "Ответы на вопросы о статусе доставки",
            frequency: "несколько раз в день",
            duration: "<5 мин",
            systems: ["мессенджеры", "CRM"],
            irritation: 5,
            regulated: "нет",
          },
          {
            title: "Еженедельный отчёт по продажам для директора",
            frequency: "раз в неделю",
            duration: ">60 мин",
            systems: ["Excel", "CRM"],
            irritation: 4,
            regulated: "да",
          },
        ],
        templateTexts: { frequency: "постоянно", example: "отчёт по фиксированному шаблону с выгрузкой из CRM" },
        aiAttitude: { attitudeScore: 4, fears: ["сложно"], genieTask: "сборка недельного отчёта" },
      }),
    },
  ];

  for (const e of employees) {
    const u = await db.user.create({
      data: { orgId: org.id, email: e.email, name: e.name, role: "EMPLOYEE", passwordHash },
    });
    const base = Date.now() - e.daysAgo * 24 * 3600 * 1000;
    await db.test1Session.create({
      data: {
        userId: u.id,
        status: "completed",
        startedAt: new Date(base),
        completedAt: new Date(base + 7 * 60 * 1000),
        answers: e.answers,
      },
    });
  }

  console.log(`Организация создана: ${orgName}, invite: ${inviteCode}`);
  console.log("owner@vector.io / vector1234; сотрудники marina/oleg/sveta@vector.io / vector1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

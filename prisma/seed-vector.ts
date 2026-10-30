/**
 * Демо-организация №2: «ООО Вектор Логистик».
 * Владелец + 3 сотрудника с завершёнными интервью (разной полноты).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEPARTMENT_DEFAULTS } from "../src/lib/content/org";

const db = new PrismaClient();

interface DemoEmployee {
  email: string;
  name: string;
  position: string;
  department: string;
  daysAgo: number;
  processes: {
    name: string;
    steps: string[];
    actors: string[];
    systems: string[];
    volume: string;
    pain: string;
  }[];
}

async function main() {
  const orgName = "ООО Вектор Логистик";
  const inviteCode = "PD-VECTOR";

  // чистим, если уже создавали
  const old = await db.organization.findUnique({ where: { inviteCode } });
  if (old) {
    await db.$transaction([
      db.analysisReport.deleteMany({ where: { map: { project: { orgId: old.id } } } }),
      db.followUpQuestion.deleteMany({ where: { project: { orgId: old.id } } }),
      db.comment.deleteMany({ where: { map: { project: { orgId: old.id } } } }),
      db.processMap.deleteMany({ where: { project: { orgId: old.id } } }),
      db.conflict.deleteMany({ where: { project: { orgId: old.id } } }),
      db.source.deleteMany({ where: { project: { orgId: old.id } } }),
      db.interviewSession.deleteMany({ where: { user: { orgId: old.id } } }),
      db.project.deleteMany({ where: { orgId: old.id } }),
      db.user.deleteMany({ where: { orgId: old.id } }),
      db.organization.delete({ where: { id: old.id } }),
    ]);
  }

  const passwordHash = await bcrypt.hash("vector1234", 10);
  const org = await db.organization.create({
    data: { name: orgName, inviteCode, hourlyRate: 60, departments: [...DEPARTMENT_DEFAULTS] },
  });

  await db.user.create({
    data: { orgId: org.id, email: "owner@vector.io", name: "Игорь Векторный", role: "OWNER", passwordHash },
  });

  const employees: DemoEmployee[] = [
    {
      email: "marina@vector.io",
      name: "Марина Ким",
      position: "Логист",
      department: "Логистика",
      daysAgo: 2,
      processes: [
        {
          name: "Обработка входящих заявок на доставку",
          steps: ["Приём заявки из почты", "Ввод в Excel", "Подтверждение склада", "Уведомление клиента"],
          actors: ["Логист", "Склад"],
          systems: ["почта", "Excel", "мессенджеры"],
          volume: "несколько раз в день по 15–60 мин",
          pain: "перенос заявок из почты в Excel и ожидание подтверждения склада",
        },
        {
          name: "Распределение заказов по перевозчикам",
          steps: ["Сбор заявок", "Выбор перевозчика", "Рассылка заданий"],
          actors: ["Логист"],
          systems: ["Excel", "почта"],
          volume: "раз в день, >60 мин",
          pain: "выбор перевозчика по опыту, без сравнения цен",
        },
      ],
    },
    {
      email: "oleg@vector.io",
      name: "Олег Тарасов",
      position: "Кладовщик",
      department: "Операции",
      daysAgo: 1,
      processes: [
        {
          name: "Сборка заказа по накладной",
          steps: ["Получение накладной", "Сборка позиций", "Проверка пересорта", "Сдача на отгрузку"],
          actors: ["Кладовщик"],
          systems: ["1С", "бумага"],
          volume: "несколько раз в день по 15–60 мин",
          pain: "пересорт при сборке из-за человеческого фактора",
        },
      ],
    },
    {
      email: "sveta@vector.io",
      name: "Света Орлова",
      position: "Менеджер по продажам",
      department: "Продажи",
      daysAgo: 0,
      processes: [
        {
          name: "Выставление счетов клиентам",
          steps: ["Проверка реквизитов", "Счёт в 1С", "Отправка клиенту"],
          actors: ["Менеджер"],
          systems: ["1С", "почта", "CRM"],
          volume: "несколько раз в день по 5–15 мин",
          pain: "ручной перенос реквизитов из CRM в 1С",
        },
        {
          name: "Ответы на вопросы о статусе доставки",
          steps: ["Поиск заказа", "Уточнение у логиста", "Ответ клиенту"],
          actors: ["Менеджер", "Логист"],
          systems: ["мессенджеры", "CRM"],
          volume: "несколько раз в день по <5 мин",
          pain: "однотипные ответы вручную в мессенджерах",
        },
        {
          name: "Еженедельный отчёт по продажам для директора",
          steps: ["Выгрузка из CRM", "Сведение в Excel", "Оформление по шаблону", "Отправка директору"],
          actors: ["Менеджер"],
          systems: ["Excel", "CRM"],
          volume: "раз в неделю, >60 мин",
          pain: "отчёт по фиксированному шаблону собирается вручную",
        },
      ],
    },
  ];

  for (const e of employees) {
    const u = await db.user.create({
      data: { orgId: org.id, email: e.email, name: e.name, role: "EMPLOYEE", passwordHash },
    });
    const base = Date.now() - e.daysAgo * 24 * 3600 * 1000;
    await db.interviewSession.create({
      data: {
        userId: u.id,
        status: "completed",
        startedAt: new Date(base),
        endedAt: new Date(base + 15 * 60 * 1000),
        agenda: [],
        coverage: { topics: {}, followUps: 0 },
        transcript: [],
        facts: [],
        summary: {
          employee: { position: e.position, department: e.department },
          processes: e.processes,
          open_questions: [],
        },
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

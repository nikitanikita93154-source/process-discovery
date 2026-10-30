/**
 * Seed: демо-организация, владелец demo@demo.io / demo1234,
 * 3 сотрудника с завершёнными интервью, один проект с источниками,
 * картой и отчётом.
 *
 * Запуск: pnpm seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEPARTMENT_DEFAULTS } from "../src/lib/content/org";
import { buildInterviewIndex, scoreMap } from "../src/lib/scoring";

const db = new PrismaClient();

type DemoProcess = {
  name: string;
  steps: string[];
  actors: string[];
  systems: string[];
  volume: string;
  pain: string;
};

type DemoEmployee = {
  email: string;
  name: string;
  position: string;
  department: string;
  daysAgo: number;
  processes: DemoProcess[];
};

async function main() {
  console.log("Seeding…");

  const passwordHash = await bcrypt.hash("demo1234", 10);

  // Чистим демо-данные (по email демо-организации)
  const oldOrg = await db.organization.findFirst({ where: { name: "Демо-ООО «Ромашка»" } });
  if (oldOrg) {
    await db.$transaction([
      db.analysisReport.deleteMany({ where: { map: { project: { orgId: oldOrg.id } } } }),
      db.followUpQuestion.deleteMany({ where: { project: { orgId: oldOrg.id } } }),
      db.comment.deleteMany({ where: { map: { project: { orgId: oldOrg.id } } } }),
      db.processMap.deleteMany({ where: { project: { orgId: oldOrg.id } } }),
      db.conflict.deleteMany({ where: { project: { orgId: oldOrg.id } } }),
      db.source.deleteMany({ where: { project: { orgId: oldOrg.id } } }),
      db.interviewSession.deleteMany({ where: { user: { orgId: oldOrg.id } } }),
      db.project.deleteMany({ where: { orgId: oldOrg.id } }),
      db.user.deleteMany({ where: { orgId: oldOrg.id } }),
      db.organization.delete({ where: { id: oldOrg.id } }),
    ]);
  }

  const org = await db.organization.create({
    data: {
      name: "Демо-ООО «Ромашка»",
      inviteCode: "PD-DEMO01",
      hourlyRate: 50,
      departments: [...DEPARTMENT_DEFAULTS],
    },
  });

  await db.user.create({
    data: { orgId: org.id, email: "demo@demo.io", name: "Демо Владелец", role: "OWNER", passwordHash },
  });

  const employees: DemoEmployee[] = [
    {
      email: "anna@demo.io",
      name: "Анна Смирнова",
      position: "Менеджер по продажам",
      department: "Продажи",
      daysAgo: 3,
      processes: [
        {
          name: "Обработка заявки клиента",
          steps: [
            "Получение заявки",
            "Проверка в CRM",
            "Подготовка КП",
            "Согласование скидки",
            "Проверка дебиторки",
            "Выставление счёта",
          ],
          actors: ["Менеджер", "Руководитель"],
          systems: ["почта", "CRM", "Excel", "1С", "мессенджеры"],
          volume: "10–15 заявок в день",
          pain: "ручной перенос данных между системами и ожидание согласования скидки",
        },
      ],
    },
    {
      email: "boris@demo.io",
      name: "Борис Петров",
      position: "Бухгалтер",
      department: "Финансы",
      daysAgo: 3,
      processes: [
        {
          name: "Сверка счетов с контрагентами",
          steps: ["Выгрузка счетов из 1С", "Сверка с контрагентом по почте", "Формирование акта сверки", "Отправка на подпись"],
          actors: ["Бухгалтер", "Директор"],
          systems: ["1С", "почта", "бумага"],
          volume: "несколько раз в неделю, >60 мин на один раз",
          pain: "ожидание подписи директора и ручной разнос выписок",
        },
      ],
    },
    {
      email: "vera@demo.io",
      name: "Вера Козлова",
      position: "Логист",
      department: "Логистика",
      daysAgo: 2,
      processes: [
        {
          name: "Отслеживание доставки и уведомление клиентов",
          steps: ["Проверка статуса доставки", "Составление уведомления", "Рассылка клиентам"],
          actors: ["Логист"],
          systems: ["мессенджеры", "почта", "Excel"],
          volume: "несколько раз в день по 5–15 мин",
          pain: "однотипные письма «ваш заказ в пути» вручную",
        },
      ],
    },
  ];

  const userIds = new Map<string, string>();
  for (const e of employees) {
    const u = await db.user.create({
      data: { orgId: org.id, email: e.email, name: e.name, role: "EMPLOYEE", passwordHash },
    });
    userIds.set(e.email, u.id);
    const base = Date.now() - e.daysAgo * 24 * 3600 * 1000;
    await db.interviewSession.create({
      data: {
        userId: u.id,
        status: "completed",
        startedAt: new Date(base),
        endedAt: new Date(base + 12 * 60 * 1000),
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

  // --- Демо-проект discovery: источники, конфликт, карта, отчёт ---
  const project = await db.project.create({
    data: {
      orgId: org.id,
      title: "Обработка заявок клиентов",
      description: "Discovery процесса от заявки до отгрузки",
      status: "analyzed",
    },
  });

  // Источник-интервью (Анна)
  const interviewSource = await db.source.create({
    data: {
      projectId: project.id,
      type: "interview",
      name: "Интервью — Анна Смирнова",
      status: "parsed",
      parsedJson: {
        candidateSteps: [
          { name: "Получение заявки из почты", actor: "Менеджер", system: "почта", frequency: "несколько раз в день", volume: "10–15 в день", source: "msg#3" },
          { name: "Проверка данных клиента в CRM", actor: "Менеджер", system: "CRM", frequency: "несколько раз в день", source: "msg#5" },
          { name: "Подготовка коммерческого предложения", actor: "Менеджер", system: "Excel", frequency: "несколько раз в день", volume: "8–10 в день", source: "msg#7" },
          { name: "Согласование скидки с руководителем", actor: "Руководитель", system: "мессенджеры", frequency: "несколько раз в неделю", source: "msg#9" },
          { name: "Проверка дебиторки перед отгрузкой", actor: "Менеджер", system: "1С", frequency: "раз в день", source: "msg#11" },
          { name: "Выставление счёта", actor: "Менеджер", system: "1С", frequency: "несколько раз в день", source: "msg#13" },
        ],
        actors: ["Менеджер", "Руководитель", "Бухгалтер"],
        rules: [{ text: "Скидки до 10% менеджер согласовывает сам, свыше — с руководителем", source: "msg#9" }],
        exceptions: ["Клиент с просроченной дебиторкой — отгрузка только после оплаты"],
        citations: [{ ref: "Интервью Анны Смирновой" }],
        interview: {
          summary: {
            employee: { position: "Менеджер по продажам", department: "Продажи" },
            processes: employees[0].processes,
            open_questions: ["Какой порог скидки фактически действует?"],
          },
        },
      },
    },
  });

  // Источник-документ (регламент) + конфликт с фактом интервью
  const docSource = await db.source.create({
    data: {
      projectId: project.id,
      type: "document",
      name: "Регламент согласования скидок.pdf",
      fileRef: null,
      status: "parsed",
      parsedJson: {
        candidateSteps: [{ name: "Согласование скидки", actor: "Руководитель", system: "1С", ref: "стр. 2" }],
        actors: ["Менеджер", "Руководитель"],
        rules: [
          { text: "Скидки свыше 5% согласует руководитель отдела (порог 5%)", source: "стр. 2" },
          { text: "Срок согласования — не более 1 рабочего дня", source: "стр. 3" },
        ],
        exceptions: [],
        citations: [{ ref: "стр. 2–3" }],
      },
    },
  });

  await db.conflict.create({
    data: {
      projectId: project.id,
      docSourceId: docSource.id,
      interviewSourceId: interviewSource.id,
      description:
        "Регламент: «Скидки свыше 5% согласует руководитель (порог 5%)» ↔ Интервью: «Скидки до 10% менеджер согласовывает сам». Фактический порог отличается от регламента.",
    },
  });

  // Карта процесса v1 (с цитатами на источники)
  const mapJson = {
    stages: [
      {
        id: "stage-1",
        name: "Приём и проверка",
        steps: [
          { id: "step-1-1", name: "Получение заявки из почты", actor: "Менеджер", system: "почта", trigger: "новое письмо", decisions: [], risks: [], citations: [{ sourceId: interviewSource.id, ref: "msg#3" }] },
          { id: "step-1-2", name: "Проверка данных клиента в CRM", actor: "Менеджер", system: "CRM", decisions: [], risks: [], citations: [{ sourceId: interviewSource.id, ref: "msg#5" }] },
        ],
      },
      {
        id: "stage-2",
        name: "Предложение и согласование",
        steps: [
          { id: "step-2-1", name: "Подготовка коммерческого предложения", actor: "Менеджер", system: "Excel", decisions: [], risks: [], citations: [{ sourceId: interviewSource.id, ref: "msg#7" }] },
          {
            id: "step-2-2",
            name: "Согласование скидки",
            actor: "Руководитель",
            system: "мессенджеры",
            decisions: [{ condition: "скидка > порога", to: "Проверка дебиторки перед отгрузкой" }],
            risks: [{ severity: "высокая", likelihood: "средняя", mitigation: "автоматическая проверка порога в CRM", source: interviewSource.id }],
            citations: [
              { sourceId: docSource.id, ref: "стр. 2" },
              { sourceId: interviewSource.id, ref: "msg#9" },
            ],
          },
        ],
      },
      {
        id: "stage-3",
        name: "Отгрузка",
        steps: [
          { id: "step-3-1", name: "Проверка дебиторки перед отгрузкой", actor: "Менеджер", system: "1С", decisions: [], risks: [{ severity: "высокая", likelihood: "низкая", mitigation: "автоотчёт по должникам", source: interviewSource.id }], citations: [{ sourceId: interviewSource.id, ref: "msg#11" }] },
          { id: "step-3-2", name: "Выставление счёта", actor: "Менеджер", system: "1С", decisions: [], risks: [], citations: [{ sourceId: interviewSource.id, ref: "msg#13" }] },
        ],
      },
    ],
    goal: "Обработать заявку клиента и выставить счёт",
    owner: "Руководитель отдела продаж",
    kpi: "Время от заявки до счёта ≤ 4 часов",
    endState: "Счёт выставлен, данные в CRM и 1С актуальны",
  };
  const map = await db.processMap.create({
    data: { projectId: project.id, version: 1, json: mapJson, author: "ai" },
  });

  // Отчёт анализа — детерминированный скоринг без LLM
  const interviewIndex = buildInterviewIndex([interviewSource.parsedJson as never]);
  const { steps, totals, stp } = scoreMap({
    map: mapJson as never,
    interviewIndex,
    hourlyRate: 50,
    llmEstimates: new Map(),
  });
  await db.analysisReport.create({
    data: {
      mapId: map.id,
      scores: { steps, totals, stp, generatedAt: new Date().toISOString(), llmNotes: [] },
      swot: {
        strengths: ["Процесс понятен сотрудникам и стабилен", "Данные заявок уже фиксируются в CRM"],
        weaknesses: ["Ручной перенос данных между 5 системами", "Согласование скидок в мессенджерах без фиксации"],
        opportunities: ["RPA-перенос данных почта→CRM→1С", "Автопроверка порога скидки в CRM", "LLM-черновики коммерческих предложений"],
        threats: ["Сопротивление сотрудников изменениям", "Нестабильность данных при миграции"],
      },
    },
  });

  // Follow-up вопрос из комментария (демо очереди)
  const annaComment = await db.comment.create({
    data: { mapId: map.id, nodeId: "step-2-2", authorId: (await db.user.findUnique({ where: { email: "demo@demo.io" } }))!.id, body: "Уточнить реальный порог согласования скидки у руководителя" },
  });
  await db.followUpQuestion.create({
    data: { projectId: project.id, text: "Уточнить реальный порог согласования скидки у руководителя", status: "open", sourceCommentId: annaComment.id },
  });

  console.log("Seed завершён: demo@demo.io / demo1234, сотрудники anna/boris/vera@demo.io (пароль demo1234)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

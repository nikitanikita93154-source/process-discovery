/**
 * Seed: демо-организация, владелец demo@demo.io / demo1234,
 * 3 сотрудника с заполненным Тестом 1, один проект с источниками,
 * картой и отчётом (карта/отчёт добавляются в последующих фазах).
 *
 * Запуск: pnpm seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEPARTMENT_DEFAULTS, type Test1Answers } from "../src/lib/schemas/test1";
import { buildInterviewIndex, buildT1Index, scoreMap } from "../src/lib/scoring";

const db = new PrismaClient();

const t1 = (over: Partial<Test1Answers> = {}): Test1Answers => ({
  passport: {
    position: "Специалист",
    department: "Операции",
    experience: "1–3 года",
  },
  tasks: [
    {
      title: "Обработка входящих заявок",
      frequency: "несколько раз в день",
      duration: "15–60 мин",
      systems: ["почта", "CRM"],
      irritation: 4,
      regulated: "нет",
    },
  ],
  expectations: { waitingFrequency: 4, waitingFor: "согласования руководителя", behaviorWhileWaiting: "переключаюсь на другое" },
  mistakes: { tasksWithErrors: "обработка заявок", errorFrequency: "несколько раз в неделю", causes: ["нет данных", "непонятные требования"] },
  gutDecisions: { hasGutDecisions: true, example: "одобряю скидку по опыту, без анализа маржи" },
  templateTexts: { frequency: "постоянно", example: "ответ клиенту о статусе заказа" },
  aiAttitude: { attitudeScore: 4, fears: ["ошибки"], genieTask: "черновики ответов клиентам" },
  openQuestion: { wasteOfTime: "перенос данных из почты в CRM" },
  ...over,
});

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
      db.test1Session.deleteMany({ where: { user: { orgId: oldOrg.id } } }),
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

  const owner = await db.user.create({
    data: { orgId: org.id, email: "demo@demo.io", name: "Демо Владелец", role: "OWNER", passwordHash },
  });
  await db.test1Session.create({ data: { userId: owner.id, status: "not_started" } });

  const employees = [
    {
      email: "anna@demo.io",
      name: "Анна Смирнова",
      answers: t1({
        passport: { position: "Менеджер по продажам", department: "Продажи", experience: "3+ лет" },
        tasks: [
          {
            title: "Подготовка коммерческих предложений",
            frequency: "несколько раз в день",
            duration: "15–60 мин",
            systems: ["Excel", "почта", "CRM"],
            irritation: 4,
            regulated: "нет",
          },
          {
            title: "Проверка дебиторки перед отгрузкой",
            frequency: "раз в день",
            duration: "15–60 мин",
            systems: ["1С", "Excel"],
            irritation: 5,
            regulated: "да",
          },
        ],
        aiAttitude: { attitudeScore: 5, fears: ["ничего не боюсь"], genieTask: "сборка КП из шаблона по данным CRM" },
      }),
    },
    {
      email: "boris@demo.io",
      name: "Борис Петров",
      answers: t1({
        passport: { position: "Бухгалтер", department: "Финансы", experience: "3+ лет" },
        tasks: [
          {
            title: "Сверка счетов с контрагентами",
            frequency: "несколько раз в неделю",
            duration: ">60 мин",
            systems: ["1С", "почта", "бумага"],
            irritation: 5,
            regulated: "да",
          },
          {
            title: "Формирование актов сверки",
            frequency: "раз в неделю",
            duration: "15–60 мин",
            systems: ["1С", "почта"],
            irritation: 3,
            regulated: "да",
          },
          {
            title: "Разнесение банковских выписок",
            frequency: "раз в день",
            duration: "15–60 мин",
            systems: ["1С", "Excel"],
            irritation: 4,
            regulated: "да",
          },
        ],
        expectations: { waitingFrequency: 5, waitingFor: "подписи директора", behaviorWhileWaiting: "жду, ничего не делаю" },
        aiAttitude: { attitudeScore: 3, fears: ["заменят", "сложно"], genieTask: "разнесение выписок" },
      }),
    },
    {
      email: "vera@demo.io",
      name: "Вера Козлова",
      answers: t1({
        passport: { position: "Логист", department: "Логистика", experience: "6–12 мес" },
        tasks: [
          {
            title: "Отслеживание доставки и уведомление клиентов",
            frequency: "несколько раз в день",
            duration: "5–15 мин",
            systems: ["мессенджеры", "почта", "Excel"],
            irritation: 3,
            regulated: "нет",
          },
        ],
        templateTexts: { frequency: "постоянно", example: "письмо «ваш заказ в пути»" },
        aiAttitude: { attitudeScore: 4, fears: ["сложно"], genieTask: "автоуведомления клиентам" },
      }),
    },
  ];

  for (const e of employees) {
    const u = await db.user.create({
      data: { orgId: org.id, email: e.email, name: e.name, role: "EMPLOYEE", passwordHash },
    });
    await db.test1Session.create({
      data: {
        userId: u.id,
        status: "completed",
        startedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
        completedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 6 * 60 * 1000),
        answers: e.answers,
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
  const anna = await db.user.findUnique({ where: { email: "anna@demo.io" } });
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
        citations: [{ ref: "Интервью Анны Смирновой, темы: дип-дайв задач, передачи" }],
        interview: {
          summary: {
            processes: [
              {
                name: "Обработка заявки клиента",
                steps: ["Получение заявки", "Проверка в CRM", "Подготовка КП", "Согласование скидки", "Проверка дебиторки", "Выставление счёта"],
                actors: ["Менеджер", "Руководитель"],
                systems: ["почта", "CRM", "Excel", "1С", "мессенджеры"],
                volume: "10–15 заявок в день",
                pain: "ручной перенос данных между системами и ожидание согласования скидки",
              },
            ],
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
  const t1AnswersList = employees.map((e) => e.answers);
  const t1Index = buildT1Index(t1AnswersList);
  const interviewIndex = buildInterviewIndex(
    [interviewSource.parsedJson as never],
    t1AnswersList,
  );
  const { steps, totals, stp } = scoreMap({
    map: mapJson as never,
    t1Index,
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
    data: { mapId: map.id, nodeId: "step-2-2", authorId: owner.id, body: "Уточнить реальный порог согласования скидки у руководителя" },
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

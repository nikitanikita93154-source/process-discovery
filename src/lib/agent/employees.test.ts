import { describe, expect, it } from "vitest";
import { contributingInterviews, employeesForProject, type InterviewSourceRow } from "@/lib/agent/employees";

const P1 = "proj-1";
const P2 = "proj-2";

function src(overrides: Partial<InterviewSourceRow> & Record<string, unknown>): InterviewSourceRow {
  return { id: "s", name: "", projectId: P1, parsedJson: {}, ...overrides };
}

describe("employeesForProject", () => {
  it("прямой источник проекта + интервью с совпадающим процессом в резюме", () => {
    const rows = [
      // Анна: источник лежит в самом проекте
      src({
        id: "s1",
        projectId: P1,
        name: "Интервью — Анна Смирнова",
        parsedJson: { interview: { employeeName: "Анна Смирнова", summary: { processes: [{ name: "Другое" }] } } },
      }),
      // Вера: источник в другом проекте, но резюме упоминает процесс P1
      src({
        id: "s2",
        projectId: P2,
        name: "Интервью — Вера Козлова",
        parsedJson: {
          interview: {
            employeeName: "Вера Козлова",
            summary: { processes: [{ name: "Ручная рассылка писем-напоминаний клиентам (ежедневно)" }] },
          },
        },
      }),
      // Борис: процесс не совпадает, источник в другом проекте — не показываем
      src({
        id: "s3",
        projectId: P2,
        name: "Интервью — Борис Петров",
        parsedJson: { interview: { employeeName: "Борис Петров", summary: { processes: [{ name: "Сверка счетов с контрагентами" }] } } },
      }),
    ];

    const employees = employeesForProject(P1, "Ручная рассылка писем-напоминаний клиентам", rows);
    expect(employees).toEqual(["Анна Смирнова", "Вера Козлова"]);
  });

  it("имя сотрудника берётся из названия источника, если parsedJson без employeeName", () => {
    const rows = [src({ id: "s1", projectId: P1, name: "Интервью — Анна Смирнова", parsedJson: {} })];
    expect(employeesForProject(P1, "Любой процесс", rows)).toEqual(["Анна Смирнова"]);
  });

  it("битый parsedJson игнорируется, дубли имён схлопываются", () => {
    const rows = [
      src({ id: "s1", projectId: P1, name: "Интервью — Анна Смирнова", parsedJson: { interview: { employeeName: "Анна Смирнова" } } }),
      src({ id: "s2", projectId: P1, name: "Интервью — Анна Смирнова", parsedJson: "не-json-объект" }),
    ];
    expect(employeesForProject(P1, "X", rows)).toEqual(["Анна Смирнова"]);
  });

  it("семантическая связка processLinks работает при перефразированном процессе", () => {
    // Анна описала «Занесение результатов звонков в CRM», проект называется
    // «Внесение и актуализация данных в CRM после звонка» — строки не совпадают,
    // но LLM-связка ведёт в этот проект
    const rows = [
      src({
        id: "s1",
        projectId: P2, // источник Анны лежит в другом проекте
        name: "Интервью — Анна Смирнова",
        parsedJson: {
          interview: {
            employeeName: "Анна Смирнова",
            summary: { processes: [{ name: "Занесение результатов звонков в CRM" }] },
            processLinks: [{ process: "Занесение результатов звонков в CRM", projectId: P1 }],
          },
        },
      }),
    ];
    expect(employeesForProject(P1, "Внесение и актуализация данных в CRM после звонка", rows)).toEqual([
      "Анна Смирнова",
    ]);
  });

  it("contributingInterviews: прямой источник впереди, внешний — с проектом-хозяином и процессом", () => {
    const rows = [
      src({
        id: "s1",
        projectId: P1,
        name: "Интервью — Вера Козлова",
        parsedJson: { interview: { employeeName: "Вера Козлова", summary: { processes: [] } } },
      }),
      src({
        id: "s2",
        projectId: P2,
        name: "Интервью — Анна Смирнова",
        parsedJson: {
          interview: {
            employeeName: "Анна Смирнова",
            summary: { processes: [{ name: "Занесение результатов звонков в CRM" }] },
            processLinks: [{ process: "Занесение результатов звонков в CRM", projectId: P1 }],
          },
        },
      }),
      // Борис: не вкладывался в P1
      src({
        id: "s3",
        projectId: P2,
        name: "Интервью — Борис Петров",
        parsedJson: { interview: { employeeName: "Борис Петров", summary: { processes: [{ name: "Сверка счетов" }] } } },
      }),
    ];
    const rows1 = contributingInterviews(P1, "Внесение и актуализация данных в CRM после звонка", rows, {
      [P2]: "Поиск новых процессов",
    });
    expect(rows1).toHaveLength(2);
    expect(rows1[0]).toMatchObject({ employeeName: "Вера Козлова", direct: true });
    expect(rows1[1]).toMatchObject({
      employeeName: "Анна Смирнова",
      direct: false,
      hostProjectTitle: "Поиск новых процессов",
      matchedProcess: "Занесение результатов звонков в CRM",
    });
  });
});

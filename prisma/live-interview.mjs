/**
 * Живой прогон Теста 2 для сотрудника через SSE API (Ollama за LLM-адаптером):
 * приветствие → ответы → SKIP хвостовых тем → подтверждение резюме.
 */
const BASE = "http://localhost:3100";
const EMAIL = process.argv[2] ?? "marina@vector.io";
const PASSWORD = process.argv[3] ?? "vector1234";

function jar() {
  const cookies = new Map();
  return {
    store(res) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
    },
    header: () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}

async function login(j) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  j.store(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: j.header() },
    body: `csrfToken=${encodeURIComponent(csrfToken)}&email=${EMAIL}&password=${PASSWORD}`,
    redirect: "manual",
  });
  j.store(res);
  if (res.status >= 400) throw new Error(`login failed: ${res.status}`);
}

/** POST /api/test2/stream с разбором SSE-событий. */
async function turn(j, payload) {
  const res = await fetch(`${BASE}/api/test2/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: j.header() },
    body: JSON.stringify(payload),
  });
  j.store(res);
  if (!res.ok) throw new Error(`stream ${res.status}: ${await res.text()}`);
  const text = await res.text();
  const events = [];
  for (const block of text.split("\n\n")) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (data) {
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {
        /* ignore */
      }
    }
  }
  return events;
}

function pick(events, name) {
  return events.find((e) => e.event === name)?.data;
}

async function main() {
  const j = jar();
  await login(j);
  console.log(`[login] ${EMAIL}`);

  // 1. Приветствие
  let events = await turn(j, {});
  const session = pick(events, "session");
  const sessionId = session?.sessionId;
  let t = pick(events, "turn");
  console.log(`[agent] ${t?.message?.slice(0, 220)}`);

  const answers = [
    "Готова, начинайте.",
    "Заявки на доставку приходят на почту, примерно 10–15 в день. Я проверяю адрес и параметры груза, вношу заявку в Excel-таблицу, подбираю дату доставки, после этого пишу клиенту подтверждение. На одну заявку уходит минут 20, почти всё вручную: копирую из письма в таблицу.",
    "Участвуют: клиент (присылает заявку), я (логист), склад подтверждает наличие. Системы: почта, Excel и мессенджер для связи со складом. Иногда ждём подтверждения склада полдня.",
    "Распределение по перевозчикам: раз в день, больше часа. Сравниваю цены из прайсов в Excel, выбираю по опыту — кто надёжнее, без формального рейтинга. Ошибки бывают, когда в прайсах устаревшие цены: раз в неделю приходится передоговариваться.",
  ];

  let status = (session?.status) ?? "in_progress";
  for (const msg of answers) {
    if (status !== "in_progress") break;
    console.log(`[user] ${msg.slice(0, 100)}…`);
    events = await turn(j, { sessionId, message: msg });
    t = pick(events, "turn");
    const s = pick(events, "session");
    if (s) status = s.status;
    console.log(`[agent] ${t?.message?.slice(0, 220)}`);
    if (!t) {
      const err = pick(events, "error");
      console.log(`[error] ${JSON.stringify(err)}`);
    }
  }

  // 2. SKIP до резюме (максимум 8 попыток)
  for (let i = 0; i < 8 && status === "in_progress"; i++) {
    events = await turn(j, { sessionId, command: "SKIP" });
    t = pick(events, "turn");
    const s = pick(events, "session");
    if (s) status = s.status;
    console.log(`[skip→agent] ${t?.message?.slice(0, 160)}`);
  }

  let summary = pick(events, "summary");
  if (!summary) {
    const res = await fetch(`${BASE}/api/test2/session`, { headers: { Cookie: j.header() } });
    const data = await res.json();
    summary = data.session?.summary;
    status = data.session?.status ?? status;
  }
  console.log(`[status] ${status}`);
  if (!summary || status !== "awaiting_confirmation") {
    console.log("[fatal] summary не получен, последние события:", JSON.stringify(events).slice(0, 500));
    process.exit(1);
  }

  const processes = (summary.processes ) ?? [];
  console.log(`[summary] процессы: ${processes.map((p) => `${p.name} (${p.steps.length} шагов)`).join("; ")}`);

  // 3. Подтверждение
  const confirmRes = await fetch(`${BASE}/api/test2/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: j.header() },
    body: JSON.stringify({ sessionId, summary }),
  });
  const confirm = await confirmRes.json();
  console.log(`[confirm] ${JSON.stringify(confirm)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

# Process Discovery

Платформа AI-discovery бизнес-процессов: помогает компании найти процессы-кандидаты на автоматизацию.

Полный цикл: **CAPTURE** (анкета + AI-интервью + документы) → **BUILD** (карта процесса с цитатами-источниками) → **VALIDATE** (канвас с правками и комментариями) → **ANALYZE** (детерминированный скоринг: часы/стоимость/приоритет + SWOT).

## Стек

- Next.js 16 (App Router) + TypeScript strict + React 19
- Prisma ORM + SQLite (разработка; совместимо с PostgreSQL)
- Auth.js (NextAuth v5), credentials (email + пароль, bcrypt), httpOnly-сессии
- Tailwind CSS + shadcn-подобные компоненты
- react-hook-form + zod (общие схемы клиента и API в `src/lib/schemas/`)
- @xyflow/react — канвас карты процесса
- SSE (Server-Sent Events) — стриминг чата агента (без WebSocket)
- LLM: единый адаптер `src/lib/llm/index.ts` — OpenAI-совместимый API
- Парсинг файлов: pdf-parse, mammoth, xlsx; хранение загрузок в `./uploads`

## Запуск

Требуется Node.js 20+ и pnpm.

```bash
pnpm install
cp .env.example .env        # затем заполните LLM_* (обязательно)
pnpm db:push                # создать SQLite-базу по схеме Prisma
pnpm seed                   # демо-данные (опционально)
pnpm dev                    # http://localhost:3000
```

### Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Строка подключения (dev: `file:./dev.db`) |
| `AUTH_SECRET` | Секрет сессий Auth.js (сгенерируйте `openssl rand -base64 32`) |
| `LLM_BASE_URL` | **Обязательно.** База OpenAI-совместимого API, напр. `https://api.openai.com/v1` |
| `LLM_API_KEY` | **Обязательно.** Ключ API |
| `LLM_MODEL` | **Обязательно.** Имя модели, напр. `gpt-4o-mini` |

> **LLM обязателен**: без настроенных `LLM_*` приложение запускается и работает
> (анкеты, канвас, детерминированный скоринг, CSV), но AI-интервью, извлечение
> из документов, сборка карты и SWOT будут возвращать понятную ошибку —
> задайте переменные в `.env`.

Любой OpenAI-совместимый провайдер подходит (OpenAI, OpenRouter, локальный
vLLM/Ollama с OpenAI-эндпоинтом и т.п.) — меняются только три переменные `LLM_*`.

## Демо-данные (после `pnpm seed`)

- Владелец: **demo@demo.io / demo1234** (организация «Демо-ООО „Ромашка“», invite-код `PD-DEMO01`)
- Сотрудники: anna@demo.io, boris@demo.io, vera@demo.io (пароль `demo1234`, Тест 1 пройден)
- Проект «Обработка заявок клиентов»: интервью-источник, документ-регламент с
  конфликтом «документ vs интервью», карта v1 с цитатами, отчёт скоринга, follow-up вопрос

## Роли

- **Владелец** (создаёт организацию при регистрации без invite-кода): дашборд
  прогресса, команда + invite-код + настройки (ставка ₽/час, отделы), проекты,
  канвас карты, анализ, аналитика и CSV.
- **Сотрудник** (регистрация с invite-кодом): Тест 1 (анкета ~13 вопросов),
  затем Тест 2 (AI-интервью в чате) и резюме.

Изоляция организаций: каждый API-роут фильтрует данные по `orgId` из сессии;
чужие сущности возвращают 404. Роли проверяются на сервере.

## Миграция на PostgreSQL

1. Установить/поднять PostgreSQL и создать базу.
2. В `.env` заменить `DATABASE_URL`, например:
   `DATABASE_URL="postgresql://user:pass@localhost:5432/process_discovery?schema=public"`
3. Применить схему: `npx prisma db push` (или сгенерировать миграции `npx prisma migrate dev --name init`).
4. Пересоздать данные: `pnpm seed` (при необходимости).

Специфичные для SQLite возможности не использовались (enum'ы заменены строками
с zod-валидацией), поэтому схема совместима с PostgreSQL без изменений.

## Структура

```
prisma/schema.prisma     # модель данных (SQLite/PostgreSQL)
prisma/seed.ts           # демо-данные
src/lib/schemas/         # zod-контракты: auth, test1, test2, source, map, analysis
src/lib/llm/             # LLM-адаптер (OpenAI-совместимый, JSON + repair)
src/lib/agent/           # агент интервью, повестка, финализация в Source
src/lib/scoring/         # детерминированный скоринг + веса (константы)
src/lib/files/parse.ts   # извлечение текста: PDF/DOCX/XLSX
src/lib/content/ru.ts    # все тексты UI (русский)
src/app/api/             # API-роуты (SSE: /api/test2/stream)
src/components/          # UI: формы, чат, канвас (@xyflow/react), таблицы
uploads/                 # загруженные документы
```

## Скрипты

| Команда | Действие |
|---|---|
| `pnpm dev` | dev-сервер |
| `pnpm build` / `pnpm start` | прод-сборка и запуск |
| `pnpm db:push` | применить схему Prisma к БД |
| `pnpm seed` | демо-данные |
| `pnpm db:studio` | Prisma Studio (просмотр БД) |

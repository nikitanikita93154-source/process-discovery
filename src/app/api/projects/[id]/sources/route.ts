import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { handle, ApiError } from "@/lib/api";
import { requireApiOwner, requireProject } from "@/lib/guards";
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE, extractText, fileExtension } from "@/lib/files/parse";
import { chat } from "@/lib/llm";
import { detectDocumentProcess } from "@/lib/agent/routing";
import {
  conflictDetectionSchema,
  docExtractionSchema,
  docExtractionToParsedSource,
  parsedSourceSchema,
  type ParsedSource,
} from "@/lib/schemas/source";

export const maxDuration = 120;

function sanitizeFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(-80);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await requireApiOwner();
    const { id } = await params;
    const project = await requireProject(id, owner.orgId);

    const form = await req.formData().catch(() => {
      throw new ApiError(400, "Ожидается multipart/form-data с полем file");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Файл не передан");
    if (file.size === 0) throw new ApiError(400, "Файл пустой");
    if (file.size > MAX_FILE_SIZE) throw new ApiError(400, "Файл больше 10 МБ");

    const ext = fileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext as (typeof ACCEPTED_EXTENSIONS)[number])) {
      throw new ApiError(400, `Разрешены только файлы ${ACCEPTED_EXTENSIONS.join(", ")}`);
    }

    // --- Сохранение в ./uploads ---
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    const fileRef = `${randomBytes(8).toString("hex")}_${sanitizeFilename(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(uploadsDir, fileRef), buffer);

    // --- Извлечение текста ---
    let text: string;
    let meta: string;
    try {
      const parsed = await extractText(buffer, file.name);
      text = parsed.text;
      meta = parsed.pages ? `${parsed.pages} стр.` : parsed.sheets ? `листы: ${parsed.sheets.join(", ")}` : "";
    } catch (e) {
      await db.source.create({
        data: { projectId: project.id, type: "document", name: file.name, fileRef, status: "failed" },
      });
      throw new ApiError(422, `Не удалось разобрать файл: ${e instanceof Error ? e.message : "неизвестная ошибка"}`);
    }

    if (!text.trim()) {
      await db.source.create({
        data: { projectId: project.id, type: "document", name: file.name, fileRef, status: "failed" },
      });
      throw new ApiError(422, "В файле не найден текст (возможно, это скан без текстового слоя)");
    }

    const source = await db.source.create({
      data: { projectId: project.id, type: "document", name: file.name, fileRef, status: "pending" },
    });

    if (project.status === "draft") {
      await db.project.update({ where: { id: project.id }, data: { status: "capturing" } });
    }

    // --- LLM-извлечение: шаги, акторы, правила, цитаты ---
    let parsedJson: ParsedSource;
    try {
      const extraction = await chat(
        [
          {
            role: "system",
            content: `Ты — аналитик бизнес-процессов. Из текста документа извлеки: повторяемые шаги процесса (candidate_steps с указанием ref — раздела/страницы), участников (actors), правила и регламенты (rules с ref), исключительные ситуации (exceptions), и список цитат-мест (citations, ref = «стр. N» или раздел). Отвечай СТРОГО JSON по схеме. Если чего-то нет — пустой массив.`,
          },
          {
            role: "user",
            content: `Документ: «${file.name}» ${meta}\n\nТекст (сокращён до 15000 символов):\n${text.slice(0, 15000)}`,
          },
        ],
        { schema: docExtractionSchema, temperature: 0.1 },
      );
      parsedJson = docExtractionToParsedSource(extraction);
      parsedSourceSchema.parse(parsedJson); // самопроверка
    } catch (e) {
      await db.source.update({ where: { id: source.id }, data: { status: "failed" } });
      return NextResponse.json(
        {
          source: { id: source.id, name: file.name, status: "failed" },
          warning: `Текст извлечён, но LLM-обработка не удалась: ${e instanceof Error ? e.message : "ошибка"}`,
        },
        { status: 200 },
      );
    }

    await db.source.update({
      where: { id: source.id },
      data: { status: "parsed", parsedJson },
    });

    // --- Детекция конфликтов с фактами интервью + процессов документа ---
    let conflictsCreated = 0;
    let candidatesCreated = 0;
    const interviewSources = await db.source.findMany({
      where: { projectId: project.id, type: "interview", status: "parsed" },
    });
    if (interviewSources.length > 0 && parsedJson.rules.length > 0) {
      const interviewFacts = interviewSources.flatMap((s) => {
        const p = s.parsedJson as ParsedSource | null;
        return (p?.candidateSteps ?? []).map((st) => st.name).concat((p?.rules ?? []).map((r) => r.text));
      });
      try {
        const detection = await chat(
          [
            {
              role: "system",
              content: `Ты — аудитор процессов. Сравни правила из регламента с фактами из интервью сотрудников. Найди ПРОТИВОРЕЧИЯ: числовые пороги, порядок действий, ответственности, сроки, которые расходятся. Указывай только реальные противоречия, не совпадения. Отвечай СТРОГО JSON по схеме, contradictions пустой если противоречий нет.`,
            },
            {
              role: "user",
              content: `ПРАВИЛА ДОКУМЕНТА «${file.name}»:\n${parsedJson.rules.map((r) => `- ${r.text} (${r.source ?? ""})`).join("\n")}\n\nФАКТЫ ИЗ ИНТЕРВЬЮ:\n${interviewFacts.map((f) => `- ${f}`).join("\n")}`,
            },
          ],
          { schema: conflictDetectionSchema, temperature: 0.1 },
        );
        for (const c of detection.contradictions) {
          await db.conflict.create({
            data: {
              projectId: project.id,
              docSourceId: source.id,
              interviewSourceId: interviewSources[0].id,
              description: `Регламент: «${c.docRule}» ↔ Интервью: «${c.interviewFact}». ${c.description}`,
            },
          });
          conflictsCreated++;
        }
      } catch (e) {
        console.error("[conflicts]", e);
        // конфликты не критичны для загрузки — не роняем запрос
      }
    }

    // Документ описывает процесс, не совпадающий с проектом? → кандидат
    try {
      candidatesCreated = await detectDocumentProcess(
        owner.orgId,
        project.id,
        project.title,
        file.name,
        parsedJson,
      );
    } catch (e) {
      console.error("[doc-process-detection]", e);
    }

    return NextResponse.json({
      source: { id: source.id, name: file.name, status: "parsed", parsedJson },
      conflictsCreated,
      candidatesCreated,
    });
  });
}

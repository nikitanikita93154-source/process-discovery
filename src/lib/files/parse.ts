// ============================================================
// Извлечение текста из загруженных файлов: PDF / DOCX / XLSX.
// ============================================================

export type ParsedFileText = { text: string; pages?: number; sheets?: string[] };

export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".xlsx"] as const;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}

/** Извлекает текст из буфера файла по расширению. */
export async function extractText(buffer: Buffer, filename: string): Promise<ParsedFileText> {
  const ext = fileExtension(filename);
  switch (ext) {
    case ".pdf":
      return extractPdf(buffer);
    case ".docx":
      return extractDocx(buffer);
    case ".xlsx":
      return extractXlsx(buffer);
    default:
      throw new Error(`Неподдерживаемый формат: ${ext || "без расширения"} (разрешены PDF, DOCX, XLSX)`);
  }
}

async function extractPdf(buffer: Buffer): Promise<ParsedFileText> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text ?? "", pages: result.pages?.length };
  } finally {
    await parser.destroy?.();
  }
}

async function extractDocx(buffer: Buffer): Promise<ParsedFileText> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value ?? "" };
}

async function extractXlsx(buffer: Buffer): Promise<ParsedFileText> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  const sheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    sheets.push(name);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    for (const row of rows) {
      const line = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").join(" | ");
      if (line) parts.push(`[лист «${name}»] ${line}`);
    }
  }
  return { text: parts.join("\n"), sheets };
}

import { spawn } from "node:child_process";
import { ApiError, handle } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";

export const runtime = "nodejs";
export const maxDuration = 130;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PCM = 120 * 16000 * 2;
const state = globalThis as typeof globalThis & { transcriptionBusy?: boolean };

async function readLimited(req: Request): Promise<Buffer> {
  const length = Number(req.headers.get("content-length"));
  if (length > MAX_BYTES) throw new ApiError(413, "Запись превышает 10 МБ");
  if (!req.body) throw new ApiError(400, "Аудиозапись отсутствует");
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) { await reader.cancel(); throw new ApiError(413, "Запись превышает 10 МБ"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  if (!total) throw new ApiError(400, "Аудиозапись пуста");
  return Buffer.concat(chunks);
}

function convert(audio: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-protocol_whitelist", "pipe", "-i", "pipe:0", "-t", "121", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"], { windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error?: Error, value?: Buffer) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value!); };
    const timer = setTimeout(() => { child.kill(); finish(new ApiError(504, "Время обработки аудио истекло")); }, 30000);
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_PCM) { child.kill(); finish(new ApiError(413, "Запись длиннее двух минут")); } else chunks.push(chunk); });
    child.stdin.on("error", () => {});
    child.on("error", () => finish(new ApiError(503, "FFmpeg недоступен")));
    child.on("close", (code) => {
      if (code !== 0) return finish(new ApiError(400, "Не удалось прочитать аудиозапись"));
      if (!size) return finish(new ApiError(400, "Аудиозапись пуста"));
      const header = Buffer.alloc(44); header.write("RIFF", 0); header.writeUInt32LE(36 + size, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(size, 40);
      finish(undefined, Buffer.concat([header, ...chunks]));
    });
    child.stdin.end(audio);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireApiUser();
    const origin = req.headers.get("origin");
    if (origin) {
      // Next.js may reconstruct req.url with its listening hostname rather than
      // the hostname used by the browser. Compare against the request host.
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
      const protocol = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.slice(0, -1);
      let expectedOrigin: string;
      try {
        if (!/^(https?)$/.test(protocol) || host.includes(",")) throw new Error("invalid host");
        expectedOrigin = new URL(`${protocol}://${host}`).origin;
      } catch {
        throw new ApiError(403, "Недопустимый источник запроса");
      }
      if (origin !== expectedOrigin) throw new ApiError(403, "Недопустимый источник запроса");
    }
    if (!/^audio\//i.test(req.headers.get("content-type") || "")) throw new ApiError(415, "Ожидается аудиозапись");
    if (state.transcriptionBusy) throw new ApiError(503, "Распознавание занято. Попробуйте ещё раз.");
    state.transcriptionBusy = true;
    let releaseDeferred = false;
    try {
      const audio = await readLimited(req);
      const wav = await convert(audio);
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
      form.append("response_format", "json");
      form.append("language", "ru");
      let response: Response;
      const inference = fetch("http://127.0.0.1:8080/inference", { method: "POST", body: form });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        response = await Promise.race([inference, new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            releaseDeferred = true;
            void inference.then(() => { state.transcriptionBusy = false; }, () => { state.transcriptionBusy = false; });
            reject(new ApiError(504, "Время распознавания истекло"));
          }, 120000);
        })]);
      } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, "Сервис распознавания недоступен"); }
      finally { if (timeout) clearTimeout(timeout); }
      if (!response.ok) throw new ApiError(503, "Не удалось распознать речь");
      const result = await response.json() as { text?: unknown };
      if (typeof result.text !== "string" || !result.text.trim()) throw new ApiError(422, "Речь не распознана. Попробуйте ещё раз.");
      return Response.json({ text: result.text.trim() });
    } finally { if (!releaseDeferred) state.transcriptionBusy = false; }
  });
}

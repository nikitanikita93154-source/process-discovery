import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import { POST } from "./route";

vi.mock("@/lib/guards", () => ({ requireApiUser: vi.fn() }));
const request = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost/api/interview/transcribe", { method: "POST", headers: { "content-type": "audio/webm", ...headers }, body });
beforeEach(() => vi.mocked(requireApiUser).mockResolvedValue({ id: "u", orgId: "o", role: "EMPLOYEE" }));
it("requires an authenticated session", async () => {
  vi.mocked(requireApiUser).mockRejectedValueOnce(new ApiError(401, "Требуется авторизация"));
  expect((await POST(request("audio"))).status).toBe(401);
});
it("rejects cross-origin requests", async () => {
  expect((await POST(request("audio", { origin: "https://example.com" }))).status).toBe(403);
});
it("accepts the browser host when Next.js reconstructs a different request URL", async () => {
  expect((await POST(request("audio", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "content-length": String(11 * 1024 * 1024) }))).status).toBe(413);
});
it("accepts the public HTTPS origin behind a proxy", async () => {
  expect((await POST(request("audio", { origin: "https://interview.example", host: "localhost:3000", "x-forwarded-host": "interview.example", "x-forwarded-proto": "https", "content-length": String(11 * 1024 * 1024) }))).status).toBe(413);
});
it("rejects an origin that differs from the public host", async () => {
  expect((await POST(request("audio", { origin: "https://evil.example", host: "localhost:3000", "x-forwarded-host": "interview.example", "x-forwarded-proto": "https" }))).status).toBe(403);
});
it("rejects oversized input before conversion", async () => {
  expect((await POST(request("audio", { "content-length": String(11 * 1024 * 1024) }))).status).toBe(413);
});
it("rejects non-audio content", async () => {
  expect((await POST(request("audio", { "content-type": "application/json" }))).status).toBe(415);
});

it("converts audio and returns the transcription without sending it to chat", async () => {
  const wav = Buffer.alloc(44 + 3200);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(3200, 40);
  const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ text: "Тестовый ответ" }));
  try {
    const req = new Request("http://localhost/api/interview/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: new Uint8Array(wav) });
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Тестовый ответ" });
    expect(mockFetch).toHaveBeenCalledWith("http://127.0.0.1:8080/inference", expect.objectContaining({ method: "POST" }));
  } finally { mockFetch.mockRestore(); }
});

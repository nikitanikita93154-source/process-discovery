"use client";

import { ArrowUp, LoaderCircle, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function VoiceInput({ disabled, hasText, textTooLong, onText, onBusyChange }: { disabled: boolean; hasText: boolean; textTooLong: boolean; onText: (text: string) => void; onBusyChange: (busy: boolean) => void }) {
  const [status, setStatus] = useState<"idle" | "starting" | "recording" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { onBusyChange(status !== "idle"); }, [status, onBusyChange]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); controller.current?.abort(); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach((track) => track.stop()); }; }, []);

  const start = async () => {
    setError(null); setStatus("starting");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Микрофон недоступен. Используйте HTTPS и поддерживаемый браузер."); setStatus("idle"); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = rec;
      const chunks: Blob[] = [];
      let bytes = 0;
      let failed = false;
      rec.ondataavailable = (event) => { if (event.data.size) { bytes += event.data.size; chunks.push(event.data); if (bytes > 10 * 1024 * 1024 && rec.state === "recording") { failed = true; rec.stop(); } } };
      rec.onerror = () => { failed = true; if (mounted.current) setError("Ошибка записи. Попробуйте ещё раз."); };
      rec.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        media.getTracks().forEach((track) => track.stop());
        if (!mounted.current) return;
        if (failed) { setError(bytes > 10 * 1024 * 1024 ? "Запись превышает 10 МБ." : "Ошибка записи. Попробуйте ещё раз."); setStatus("idle"); return; }
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) { setError("Запись пуста. Попробуйте ещё раз."); setStatus("idle"); return; }
        setStatus("processing");
        controller.current = new AbortController();
        try {
          const res = await fetch("/api/interview/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob, signal: controller.current.signal });
          const result = await res.json() as { text?: string; error?: string };
          if (!res.ok || !result.text) throw new Error(result.error || "Не удалось распознать речь.");
          if (mounted.current) onText(result.text);
        } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Ошибка распознавания."); }
        finally { if (mounted.current) setStatus("idle"); }
      };
      rec.start(1000); setStatus("recording");
      timer.current = setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 120000);
    } catch { stream.current?.getTracks().forEach((track) => track.stop()); if (mounted.current) { setError("Не удалось открыть микрофон. Проверьте разрешение браузера."); setStatus("idle"); } }
  };
  const sending = status === "idle" && hasText;
  const label = sending ? "Отправить сообщение" : status === "recording" ? "Остановить запись" : status === "processing" ? "Распознавание речи" : status === "starting" ? "Подключение микрофона" : "Начать запись";
  return <div className="relative flex shrink-0 items-center">
    <Button type={sending ? "submit" : "button"} variant="lime" size="icon" disabled={disabled || status === "starting" || status === "processing" || (sending && textTooLong)} onClick={sending ? undefined : () => status === "recording" ? recorder.current?.stop() : void start()} aria-label={label} title={label}>
      {sending ? <ArrowUp className="h-5 w-5" /> : status === "recording" ? <Square className="h-4 w-4" /> : status === "starting" || status === "processing" ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
    </Button>
    <span role="status" className="absolute bottom-full right-0 mb-3 w-max max-w-[min(80vw,20rem)] rounded-lg bg-paper px-2 py-1 text-xs text-muted empty:hidden">{status === "recording" ? "Идёт запись (до 2 минут)" : error}</span>
  </div>;
}

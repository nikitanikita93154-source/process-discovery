"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { target: "dialog", title: "Здесь проходит беседа", text: "Интервьюер задаёт вопросы о вашей работе. Рассказывайте так, как удобно вам." },
  { target: "answer", title: "Расскажите о задаче", text: "Напишите ответ здесь и нажмите «Отправить». Можно приводить примеры и отвечать приблизительно." },
  { target: "finish", title: "Можно завершить раньше", text: "Если захотите остановиться, нажмите эту кнопку. Вы сможете проверить собранное резюме." },
  { target: "progress", title: "Темы беседы", text: "Здесь показана текущая тема. По ходу разговора темы могут добавляться и меняться." },
] as const;

type Rectangle = { top: number; left: number; width: number; height: number };

export function InterviewGuide({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rectangle | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-interview-guide="${STEPS[step].target}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "nearest", behavior: "instant" });
    const update = () => {
      const box = target.getBoundingClientRect();
      const left = Math.max(8, box.left - 5);
      const top = Math.max(8, box.top - 5);
      const right = Math.min(window.innerWidth - 8, box.right + 5);
      const bottom = Math.min(window.innerHeight - 8, box.bottom + 5);
      setRect({ left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [step]);

  useEffect(() => { cardRef.current?.focus(); }, [step]);

  const popupStyle = rect ? (() => {
    const estimatedHeight = 250;
    const below = window.innerHeight - (rect.top + rect.height);
    const top = below >= estimatedHeight + 12 ? rect.top + rect.height + 12 : Math.max(12, rect.top - estimatedHeight - 12);
    return { top, left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(window.innerWidth - 24, 400) - 12)) };
  })() : { top: 16, left: 12 };

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onFinish(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
      {rect && <div aria-hidden="true" className="pointer-events-none fixed z-50 rounded-[18px] border-2 border-lime shadow-[0_0_0_9999px_rgba(23,24,28,0.7)] transition-all duration-300 ease-out" style={rect} />}
      <Dialog.Content ref={cardRef} tabIndex={-1} style={popupStyle} className="fixed z-[60] max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[400px] overflow-y-auto rounded-[20px] border border-line-warm bg-paper p-5 shadow-xl outline-none transition-[top,left] duration-300 ease-out" onPointerDownOutside={(e) => e.preventDefault()}>
        <div aria-live="polite">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Знакомство · {step + 1} / {STEPS.length}</p>
          <Dialog.Title className="font-head text-base font-medium">{STEPS[step].title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">{STEPS[step].text}</Dialog.Description>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onFinish}>Пропустить</Button>
          <div className="flex gap-2">
            {step > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setStep(step - 1)}>Назад</Button>}
            <Button type="button" size="sm" onClick={() => step === STEPS.length - 1 ? onFinish() : setStep(step + 1)}>{step === STEPS.length - 1 ? "Начать интервью" : "Далее"}</Button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

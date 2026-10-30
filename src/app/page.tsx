import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { ru } from "@/lib/content/ru";
import { buttonVariants } from "@/components/ui/button";
import { Eyebrow, SynaptLogo } from "@/components/ui/brand";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "OWNER" ? "/dashboard" : "/me");
  }
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Synapt — главная"><SynaptLogo /></Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Личный кабинет <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </header>
      <section className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div>
          <Eyebrow className="mb-7 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lime" />SYNAPT · AI-ЧЕКАП</Eyebrow>
          <h1 className="max-w-2xl font-head text-[clamp(2rem,4.7vw,4rem)] font-medium leading-[1.17] tracking-[-0.055em]">Продолжение<br /><span className="relative inline-block"><span className="absolute -inset-x-1 bottom-0.5 h-[0.45em] -rotate-2 bg-lime" aria-hidden="true" /><span className="relative">чекапа</span></span><span className="text-accent">.</span></h1>
          <p className="mt-7 max-w-lg text-base leading-relaxed text-muted sm:text-lg">{ru.landing.heroSubtitle}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "text-lime")}>{ru.landing.ctaLogin}<ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/register" className={buttonVariants({ variant: "outline", size: "lg" })}>{ru.landing.ctaRegister}</Link>
          </div>
          <p className="mt-5 text-sm text-muted">Есть код приглашения? Укажите его при регистрации.</p>
        </div>
        <div className="relative overflow-hidden rounded-[22px] border border-line-warm bg-paper p-7 sm:p-9">
          <div className="flex items-center justify-between"><Eyebrow>От диалога к действию</Eyebrow><ArrowUpRight className="h-5 w-5 text-accent" /></div>
          <svg viewBox="0 0 360 150" fill="none" className="my-5 h-28 w-full sm:h-36" aria-hidden="true">
            <path d="M5 42H118L160 75H235M5 59H110L153 92H235M5 76H102L145 109H235" stroke="#D9D2C5" strokeWidth="2" />
            <path d="M5 25H130L174 58H235" stroke="#17181C" strokeWidth="2" />
            <circle cx="270" cy="75" r="61" fill="#C7F14E" /><path d="M240 75h59m-25-25 25 25-25 25" stroke="#17181C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="divide-y divide-line-warm">
            {ru.landing.steps.map((step, i) => <div key={step.title} className="flex items-center gap-4 py-3.5"><span className="font-mono text-xs text-accent">0{i + 1}</span><span className="flex-1 text-sm font-medium">{step.title}</span><ArrowRight className="h-3.5 w-3.5 text-muted" /></div>)}
          </div>
        </div>
      </section>
      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-6 sm:px-8"><Eyebrow>Synapt Discovery</Eyebrow><span className="text-xs text-muted">Знания команды. Понятные процессы. Следующий шаг.</span></footer>
    </main>
  );
}

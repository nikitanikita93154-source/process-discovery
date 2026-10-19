import Link from "next/link";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "OWNER" ? "/dashboard" : "/me");
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold text-indigo-600">{ru.app.name}</span>
          <nav className="flex gap-3">
            <Link href="/login">
              <Button variant="ghost">{ru.landing.ctaLogin}</Button>
            </Link>
            <Link href="/register">
              <Button>{ru.landing.ctaRegister}</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          {ru.landing.heroTitle}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600">{ru.landing.heroSubtitle}</p>
        <div className="mt-10 flex justify-center gap-4">
          <Link href="/register">
            <Button size="lg">{ru.landing.ctaRegister}</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              {ru.landing.ctaLogin}
            </Button>
          </Link>
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-semibold">{ru.landing.howItWorks}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {ru.landing.steps.map((s, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="text-sm font-semibold text-indigo-600">{i + 1}</div>
                <h3 className="mt-2 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-zinc-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

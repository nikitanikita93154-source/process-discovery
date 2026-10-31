import { Check } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { Eyebrow, PageTitle } from "@/components/ui/brand";

export default async function DonePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");
  const completed = await db.interviewSession.findFirst({ where: { userId: session.user.id, status: "completed" }, select: { id: true } });
  if (!completed) redirect("/me/interview");
  return <div className="mx-auto max-w-xl space-y-6 py-12 text-center">
    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-lime"><Check className="h-9 w-9" aria-hidden="true" /></div>
    <Eyebrow>ИНТЕРВЬЮ ЗАВЕРШЕНО</Eyebrow>
    <PageTitle>Спасибо за ваши ответы!</PageTitle>
    <p className="text-muted">Интервью завершено. Теперь вы можете выйти и закрыть страницу.</p>
    <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button type="submit" className="rounded-full bg-ink px-6 py-3 text-sm text-white">Выйти</button></form>
  </div>;
}

import Link from "next/link";
import { db } from "@/lib/db";
import { SynaptLogo, Eyebrow, PageTitle } from "@/components/ui/brand";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { InvitationForm } from "@/components/invitation-form";

export default async function InvitationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const org = await db.organization.findUnique({ where: { inviteCode: code }, select: { name: true } });
  return <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
    <Link href="/" className="mb-8" aria-label="Synapt — главная"><SynaptLogo /></Link>
    <Card className="w-full max-w-md border-line-warm bg-paper"><CardHeader className="gap-2 p-7 pb-5">
      <Eyebrow className="text-accent">SYNAPT · ИНТЕРВЬЮ</Eyebrow>
      <PageTitle className="text-xl">{org ? "Приглашение на интервью" : "Ссылка недействительна"}</PageTitle>
      <CardDescription>{org ? `Организация «${org.name}» приглашает вас рассказать о вашей работе. Интервью можно прервать и продолжить позже.` : "Попросите руководителя прислать новую ссылку."}</CardDescription>
    </CardHeader>{org && <CardContent className="px-7 pb-7"><InvitationForm inviteCode={code} /></CardContent>}</Card>
  </main>;
}

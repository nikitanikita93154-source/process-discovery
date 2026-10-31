"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { invitationLoginSchema } from "@/lib/schemas/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";

export function InvitationForm({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = invitationLoginSchema.safeParse({ name, email, inviteCode });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Проверьте введённые данные"); return; }
    setBusy(true);
    setError("");
    try {
      const result = await signIn("invitation", { ...parsed.data, redirect: false });
      if (!result || result.error) { setError("Не удалось войти. Проверьте ссылку и email или обратитесь к руководителю."); return; }
      router.push("/me/interview");
      router.refresh();
    } catch {
      setError("Не удалось войти. Попробуйте ещё раз.");
    } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-5" noValidate>
    <div className="space-y-1.5"><Label htmlFor="invite-name">Имя и фамилия</Label><Input id="invite-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
    <div className="space-y-1.5"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /><p className="text-xs text-muted">Если вернётесь позже, используйте тот же email.</p></div>
    {error && <p role="alert" className="rounded-[14px] bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Входим…" : "Перейти к интервью"}</Button>
  </form>;
}

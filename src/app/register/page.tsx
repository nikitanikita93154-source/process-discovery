"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { registerSchema } from "@/lib/schemas/auth";
import type { z } from "zod";

type RegisterFormInput = z.input<typeof registerSchema>;
type RegisterFormOutput = z.output<typeof registerSchema>;
import { ru } from "@/lib/content/ru";
import { SynaptLogo, Eyebrow, PageTitle } from "@/components/ui/brand";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/form";

export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", orgName: "" },
  });

  const onSubmit = async (values: RegisterFormOutput) => {
    setServerError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setServerError(data?.error ?? ru.errors.generic);
      return;
    }
    await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    const me = await fetch("/api/me").then((r) => r.json());
    router.push(me.role === "OWNER" ? "/dashboard" : "/me/interview");
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Link href="/" className="mb-8 rounded-full" aria-label="Synapt — главная"><SynaptLogo /></Link>
      <Card className="w-full max-w-md border-line-warm bg-paper">
        <CardHeader className="gap-2 p-7 pb-5 sm:p-8 sm:pb-5">
          <Eyebrow className="text-accent">SYNAPT · AI-ЧЕКАП</Eyebrow>
          <PageTitle className="text-xl leading-snug sm:text-xl">{ru.auth.registerTitle}</PageTitle>
          <CardDescription>{ru.auth.registerSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="px-7 pb-7 sm:px-8 sm:pb-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="name">{ru.auth.name}</Label>
              <Input id="name" {...register("name")} />
              <FieldError>{errors.name?.message}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{ru.auth.email}</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              <FieldError>{errors.email?.message}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{ru.auth.password}</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
              <FieldError>{errors.password?.message}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgName">{ru.auth.orgName}</Label>
              <Input id="orgName" {...register("orgName")} />
              <p className="text-xs text-muted">{ru.auth.orgNameHint}</p>
              <FieldError>{errors.orgName?.message}</FieldError>
            </div>
            {serverError && <p role="alert" className="rounded-[14px] bg-danger-soft p-3 text-sm text-danger">{serverError}</p>}
            <Button type="submit" className="mt-2 w-full text-lime" size="lg" disabled={isSubmitting}>
              {isSubmitting ? ru.common.loading : ru.auth.submitRegister}<ArrowUpRight className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            {ru.auth.haveAccount}{" "}
            <Link href="/login" className="font-medium text-ink underline decoration-line-warm underline-offset-4 hover:decoration-ink">
              {ru.auth.submitLogin}
            </Link>
          </p>
        </CardContent>
      </Card>
      <Link href="/" className="mt-6 flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> К началу чекапа</Link>
    </main>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import { ru } from "@/lib/content/ru";
import { SynaptLogo, Eyebrow, PageTitle } from "@/components/ui/brand";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/form";

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    const res = await signIn("credentials", { ...values, redirect: false });
    if (!res || res.error) {
      setServerError("Неверный email или пароль");
      return;
    }
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
          <PageTitle className="text-xl leading-snug sm:text-xl">{ru.auth.loginTitle}</PageTitle>
          <CardDescription>{ru.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="px-7 pb-7 sm:px-8 sm:pb-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">{ru.auth.email}</Label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              <FieldError>{errors.email?.message}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{ru.auth.password}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              <FieldError>{errors.password?.message}</FieldError>
            </div>
            {serverError && <p role="alert" className="rounded-[14px] bg-danger-soft p-3 text-sm text-danger">{serverError}</p>}
            <Button type="submit" className="mt-2 w-full text-lime" size="lg" disabled={isSubmitting}>
              {isSubmitting ? ru.common.loading : ru.auth.submitLogin}<ArrowUpRight className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            {ru.auth.noAccount}{" "}
            <Link href="/register" className="font-medium text-ink underline decoration-line-warm underline-offset-4 hover:decoration-ink">
              {ru.auth.submitRegister}
            </Link>
          </p>
        </CardContent>
      </Card>
      <Link href="/" className="mt-6 flex items-center gap-2 text-sm text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> К началу чекапа</Link>
    </main>
  );
}

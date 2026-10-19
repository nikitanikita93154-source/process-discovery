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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    defaultValues: { name: "", email: "", password: "", inviteCode: "", orgName: "" },
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
    router.push(me.role === "OWNER" ? "/dashboard" : "/me");
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{ru.auth.registerTitle}</CardTitle>
          <CardDescription>{ru.auth.registerSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              <Label htmlFor="inviteCode">{ru.auth.inviteCode}</Label>
              <Input id="inviteCode" placeholder="PD-XXXXXX" {...register("inviteCode")} />
              <p className="text-xs text-zinc-400">{ru.auth.inviteCodeHint}</p>
              <FieldError>{errors.inviteCode?.message}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orgName">{ru.auth.orgName}</Label>
              <Input id="orgName" {...register("orgName")} />
              <p className="text-xs text-zinc-400">{ru.auth.orgNameHint}</p>
              <FieldError>{errors.orgName?.message}</FieldError>
            </div>
            {serverError && <p className="text-sm text-red-600">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? ru.common.loading : ru.auth.submitRegister}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            {ru.auth.haveAccount}{" "}
            <Link href="/login" className="text-indigo-600 hover:underline">
              {ru.auth.submitLogin}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

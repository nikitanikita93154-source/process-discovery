"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    router.push(me.role === "OWNER" ? "/dashboard" : "/me");
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{ru.auth.loginTitle}</CardTitle>
          <CardDescription>{ru.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
            {serverError && <p className="text-sm text-red-600">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? ru.common.loading : ru.auth.submitLogin}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            {ru.auth.noAccount}{" "}
            <Link href="/register" className="text-indigo-600 hover:underline">
              {ru.auth.submitRegister}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

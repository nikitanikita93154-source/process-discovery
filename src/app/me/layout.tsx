import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");
  return <AppShell user={{ name: session.user.name, role: session.user.role }}>{children}</AppShell>;
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signOut } from "@/lib/auth";
import { SynaptLogo } from "@/components/ui/brand";

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");
  return <div className="min-h-screen"><header className="border-b border-line bg-white"><div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4"><SynaptLogo /><form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button type="submit" className="text-sm text-muted hover:text-ink">Выйти</button></form></div></header><main className="mx-auto max-w-4xl px-4 py-8">{children}</main></div>;
}

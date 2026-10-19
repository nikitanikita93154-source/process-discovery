import Link from "next/link";
import { ru } from "@/lib/content/ru";
import { signOut } from "@/lib/auth";
import type { SessionUser } from "@/lib/guards";

const employeeNav = [
  { href: "/me", label: ru.nav.me },
  { href: "/me/test1", label: ru.nav.test1 },
];

const ownerNav = [
  { href: "/dashboard", label: ru.nav.dashboard },
  { href: "/dashboard/team", label: ru.nav.team },
  { href: "/dashboard/projects", label: ru.nav.projects },
  { href: "/dashboard/analytics", label: ru.nav.analytics },
];

export function AppShell({
  user,
  children,
}: {
  user: Pick<SessionUser, "name" | "role">;
  children: React.ReactNode;
}) {
  const nav = user.role === "OWNER" ? ownerNav : employeeNav;
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href={user.role === "OWNER" ? "/dashboard" : "/me"} className="font-bold text-indigo-600">
              {ru.app.name}
            </Link>
            <nav className="flex gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">{user.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer"
              >
                {ru.nav.logout}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

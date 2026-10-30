import Link from "next/link";
import { LogOut } from "lucide-react";
import { SynaptLogo } from "@/components/ui/brand";
import { NavLinks } from "@/components/nav-links";
import { ru } from "@/lib/content/ru";
import { signOut } from "@/lib/auth";
import type { SessionUser } from "@/lib/guards";

const employeeNav = [
  { href: "/me", label: ru.nav.me },
  { href: "/me/interview", label: ru.nav.interview },
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
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Link href={user.role === "OWNER" ? "/dashboard" : "/me"} className="rounded-full" aria-label="Synapt — главная">
              <SynaptLogo />
            </Link>
            <NavLinks items={nav} className="hidden lg:flex" />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-40 truncate text-sm text-muted sm:block">{user.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-muted hover:bg-paper hover:text-ink cursor-pointer"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" /> {ru.nav.logout}
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-line/60 px-4 py-2 lg:hidden"><NavLinks items={nav} className="overflow-x-auto thin-scroll" /></div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

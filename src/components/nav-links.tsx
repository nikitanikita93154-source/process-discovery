"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({ items, className }: { items: { href: string; label: string }[]; className?: string }) {
  const pathname = usePathname();
  return <nav aria-label="Основная навигация" className={cn("flex items-center gap-1", className)}>
    {items.map(({ href, label }) => {
      const active = pathname === href || (href !== "/dashboard" && href !== "/me" && pathname.startsWith(`${href}/`));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-2 text-sm transition-colors", active ? "bg-lime font-medium text-ink" : "text-muted hover:bg-paper hover:text-ink")}>{label}</Link>;
    })}
  </nav>;
}

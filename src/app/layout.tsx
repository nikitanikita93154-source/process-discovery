import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ru } from "@/lib/content/ru";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], display: "swap" });

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: `${ru.app.name} — ${ru.app.tagline}`, template: "%s · Synapt" },
  description: ru.landing.heroSubtitle,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body className={`${manrope.variable} min-h-screen font-body antialiased`}>{children}</body></html>;
}

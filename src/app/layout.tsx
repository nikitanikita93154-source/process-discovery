import type { Metadata } from "next";
import { Unbounded, Golos_Text, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ru } from "@/lib/content/ru";

const heading = Unbounded({ variable: "--font-unbounded", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], display: "swap" });
const body = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin", "cyrillic"], weight: ["400", "500"], display: "swap" });

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: `${ru.app.name} — ${ru.app.tagline}`, template: "%s · Synapt" },
  description: ru.landing.heroSubtitle,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body className={`${heading.variable} ${body.variable} ${mono.variable} min-h-screen font-body antialiased`}>{children}</body></html>;
}

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ru } from "@/lib/content/ru";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${ru.app.name} — ${ru.app.tagline}`,
  description: ru.landing.heroSubtitle,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${geistSans.variable} antialiased min-h-screen`}>{children}</body>
    </html>
  );
}

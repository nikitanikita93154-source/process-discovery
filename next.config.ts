import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Приложение полностью сессионное (auth/cookies + Prisma) — рендерим динамически
  serverExternalPackages: ["pdf-parse", "mammoth", "xlsx", "bcryptjs", "@prisma/client"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

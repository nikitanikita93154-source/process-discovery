import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "OWNER" | "EMPLOYEE";
      orgId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "OWNER" | "EMPLOYEE";
    orgId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "OWNER" | "EMPLOYEE";
    orgId?: string;
  }
}

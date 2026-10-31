import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { invitationLoginSchema } from "@/lib/schemas/auth";

export async function authenticateInvitation(credentials: unknown) {
  const parsed = invitationLoginSchema.safeParse(credentials);
  if (!parsed.success) return null;
  const { name, email, inviteCode } = parsed.data;
  const org = await db.organization.findUnique({ where: { inviteCode } });
  if (!org) return null;
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    try {
      user = await db.user.create({ data: { orgId: org.id, email, name, role: "EMPLOYEE", passwordHash } });
    } catch {
      user = await db.user.findUnique({ where: { email } });
    }
  }
  if (!user || user.orgId !== org.id || user.role !== "EMPLOYEE") return null;
  return { id: user.id, email: user.email, name: user.name, role: "EMPLOYEE" as const, orgId: user.orgId };
}

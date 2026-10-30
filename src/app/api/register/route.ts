import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { handle, parseBody, ApiError } from "@/lib/api";
import { registerSchema } from "@/lib/schemas/auth";
import { DEPARTMENT_DEFAULTS } from "@/lib/content/org";
import { randomBytes } from "crypto";

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `PD-${code}`;
}

async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const exists = await db.organization.findUnique({ where: { inviteCode: code } });
    if (!exists) return code;
  }
  throw new ApiError(500, "Не удалось сгенерировать invite-код");
}

export async function POST(req: Request) {
  return handle(async () => {
    const data = await parseBody(req, registerSchema);

    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ApiError(409, "Пользователь с таким email уже зарегистрирован");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    let orgId: string;
    let role: "OWNER" | "EMPLOYEE";

    if (data.inviteCode) {
      const org = await db.organization.findUnique({ where: { inviteCode: data.inviteCode } });
      if (!org) throw new ApiError(404, "Организация с таким invite-кодом не найдена");
      orgId = org.id;
      role = "EMPLOYEE";
    } else {
      const org = await db.organization.create({
        data: {
          name: data.orgName!,
          inviteCode: await uniqueInviteCode(),
          departments: [...DEPARTMENT_DEFAULTS],
        },
      });
      orgId = org.id;
      role = "OWNER";
    }

    await db.user.create({
      data: { orgId, email: data.email, name: data.name, role, passwordHash },
    });

    return NextResponse.json({ ok: true, role });
  });
}

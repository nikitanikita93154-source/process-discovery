import { NextResponse } from "next/server";
import { handle, ApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";

export async function GET() {
  return handle(async () => {
    const user = await requireApiUser().catch(() => {
      throw new ApiError(401, "Требуется авторизация");
    });
    return NextResponse.json({
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    });
  });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, parseBody } from "@/lib/api";
import { requireApiUser } from "@/lib/guards";
import { test1PatchSchema, test1AnswersSchema } from "@/lib/schemas/test1";

/**
 * PATCH /api/test1 — автосохранение черновика Теста 1.
 * Тело: { answers: Test1Draft, complete?: boolean }.
 * При complete=true — полная валидация test1AnswersSchema и переход в completed.
 */
export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireApiUser();
    const { answers, complete } = await parseBody(req, test1PatchSchema);

    if (complete) {
      const full = test1AnswersSchema.safeParse(answers);
      if (!full.success) {
        return NextResponse.json(
          { error: "Тест заполнен не полностью", issues: full.error.issues },
          { status: 422 },
        );
      }
      await db.test1Session.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          status: "completed",
          startedAt: new Date(),
          completedAt: new Date(),
          answers: full.data,
        },
        update: { status: "completed", completedAt: new Date(), answers: full.data },
      });
      return NextResponse.json({ status: "completed" });
    }

    const existing = await db.test1Session.findUnique({ where: { userId: user.id } });
    if (existing?.status === "completed") {
      return NextResponse.json({ status: "completed", alreadyCompleted: true });
    }

    await db.test1Session.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: "in_progress",
        startedAt: new Date(),
        answers,
      },
      update: { status: "in_progress", answers },
    });

    return NextResponse.json({ status: "in_progress" });
  });
}

export async function GET() {
  return handle(async () => {
    const user = await requireApiUser();
    const session = await db.test1Session.findUnique({ where: { userId: user.id } });
    return NextResponse.json({ status: session?.status ?? "not_started", answers: session?.answers });
  });
}

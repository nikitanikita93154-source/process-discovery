import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Test1Form } from "@/components/test1-form";
import type { Test1Draft } from "@/lib/schemas/test1";

export default async function Test1Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "OWNER") redirect("/dashboard");

  const [test1, org] = await Promise.all([
    db.test1Session.findUnique({ where: { userId: session.user.id } }),
    db.organization.findUnique({ where: { id: session.user.orgId } }),
  ]);

  if (test1?.status === "completed") redirect("/me");

  const departments = ((org?.departments as string[] | null) ?? []).filter(Boolean);
  const draft = (test1?.answers as Test1Draft | null) ?? null;

  return <Test1Form initialDraft={draft} departments={departments} />;
}

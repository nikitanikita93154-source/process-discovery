import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function requirePageUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) redirect("/login");
  return session.user;
}

export async function requirePageOwner() {
  const user = await requirePageUser();
  if (user.role !== "OWNER") redirect("/me");
  return user;
}

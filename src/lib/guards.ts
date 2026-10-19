import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { Project } from "@prisma/client";

export type SessionUser = { id: string; orgId: string; role: "OWNER" | "EMPLOYEE"; name?: string | null; email?: string | null };

/** Требует авторизации в API-роутах. */
export async function requireApiUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.orgId) {
    throw new ApiError(401, "Требуется авторизация");
  }
  return {
    id: session.user.id,
    orgId: session.user.orgId,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };
}

/** Требует роль OWNER в API-роутах. */
export async function requireApiOwner(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (user.role !== "OWNER") {
    throw new ApiError(403, "Доступ только для владельца организации");
  }
  return user;
}

/**
 * Изоляция организаций: проект должен принадлежать orgId из сессии,
 * иначе 404 (не раскрываем существование чужого проекта).
 */
export async function requireProject(projectId: string, orgId: string): Promise<Project> {
  const project = await db.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ApiError(404, "Проект не найден");
  return project;
}

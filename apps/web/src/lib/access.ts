import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { projects, projectUsers } from "@/db/schema";

export async function requireProjectAccess(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      role: projectUsers.role,
    })
    .from(projects)
    .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(
      and(
        eq(projects.id, projectId),
        eq(projectUsers.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!row) notFound();

  return {
    session,
    project: { id: row.id, name: row.name },
    role: row.role,
  };
}

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { projects, projectUsers } from "@/db/schema";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(projectUsers, eq(projectUsers.projectId, projects.id))
    .where(eq(projectUsers.userId, session.user.id))
    .orderBy(desc(projects.createdAt));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Link
          href="/dashboard/new"
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New project
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-600">
          You don&apos;t have any projects yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between py-3"
            >
              <span className="text-sm font-medium">{p.name}</span>
              <span className="text-xs text-neutral-500">
                {p.createdAt.toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

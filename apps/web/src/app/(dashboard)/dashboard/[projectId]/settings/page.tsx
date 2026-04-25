import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { requireProjectAccess } from "@/lib/access";
import { createApiKey } from "./actions";
import { GenerateKey } from "./generate-key";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project } = await requireProjectAccess(projectId);

  const keys = await db
    .select({
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt)),
    )
    .orderBy(desc(apiKeys.createdAt));

  const createForThisProject = createApiKey.bind(null, projectId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Back to projects
      </Link>

      <h1 className="mt-4 text-xl font-semibold">{project.name}</h1>
      <p className="mt-1 text-sm text-neutral-600">Settings · API keys</p>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">API keys</h2>
          <GenerateKey action={createForThisProject} />
        </div>

        {keys.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">
            No API keys yet. Generate one to start sending traces.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between py-3"
              >
                <code className="text-sm">{k.keyPrefix}…</code>
                <span className="text-xs text-neutral-500">
                  {k.createdAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

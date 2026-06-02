"use server";

import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { requireProjectAccess } from "@/lib/access";

export async function createApiKey(
  projectId: string,
): Promise<{ rawKey: string }> {
  await requireProjectAccess(projectId);

  const rawKey = `sk_live_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 16);

  await db.insert(apiKeys).values({
    id: crypto.randomUUID(),
    projectId,
    keyHash,
    keyPrefix,
  });

  revalidatePath(`/dashboard/${projectId}/settings`);
  return { rawKey };
}

export async function revokeApiKey(
  projectId: string,
  keyId: string,
): Promise<void> {
  await requireProjectAccess(projectId);

  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.projectId, projectId),
        isNull(apiKeys.revokedAt),
      ),
    );

  revalidatePath(`/dashboard/${projectId}/settings`);
}

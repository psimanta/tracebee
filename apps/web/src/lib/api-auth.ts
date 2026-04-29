import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schema";

export type AuthResult =
  | { ok: true; projectId: string }
  | { ok: false; reason: "missing" | "malformed" | "invalid" };

export async function authenticateApiKey(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  if (!header) return { ok: false, reason: "missing" };

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return { ok: false, reason: "malformed" };
  }

  const keyHash = createHash("sha256").update(token).digest("hex");

  const [row] = await db
    .select({ projectId: apiKeys.projectId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row) return { ok: false, reason: "invalid" };
  return { ok: true, projectId: row.projectId };
}

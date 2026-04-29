export type TraceCursor = { startedAt: string; id: string };

export function encodeCursor(c: TraceCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(s: string | undefined): TraceCursor | null {
  if (!s) return null;
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (
      parsed &&
      typeof parsed === "object" &&
      "startedAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as TraceCursor).startedAt === "string" &&
      typeof (parsed as TraceCursor).id === "string" &&
      (parsed as TraceCursor).startedAt.length > 0 &&
      (parsed as TraceCursor).id.length > 0
    ) {
      return { startedAt: (parsed as TraceCursor).startedAt, id: (parsed as TraceCursor).id };
    }
    return null;
  } catch {
    return null;
  }
}

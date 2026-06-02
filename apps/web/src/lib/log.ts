type Level = "info" | "warn" | "error";

export type IngestLog = {
  requestId: string;
  status: number;
  durationMs: number;
  projectId?: string;
  traceId?: string;
  spanCount?: number;
  reason?: string;
  err?: unknown;
};

export function logIngest(level: Level, fields: IngestLog): void {
  const { err, ...rest } = fields;
  const line: Record<string, unknown> = {
    t: new Date().toISOString(),
    level,
    event: "ingest",
    ...rest,
  };
  if (err instanceof Error) {
    line.errName = err.name;
    line.errMessage = err.message;
  } else if (err !== undefined) {
    line.errMessage = String(err);
  }
  console.log(JSON.stringify(line));
}

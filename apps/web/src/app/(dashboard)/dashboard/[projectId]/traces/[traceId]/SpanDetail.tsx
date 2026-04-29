import type { spans } from "@/db/schema";
import { formatCost, formatDuration, formatTimestamp } from "@/lib/format";

type Span = typeof spans.$inferSelect;

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value, null, 2);
}

function formatTokenCount(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

export function SpanDetail({ span }: { span: Span }) {
  const isLlm = span.kind === "llm";
  const isError = span.status === "error";
  const duration =
    span.durationMs !== null ? formatDuration(span.durationMs) : "—";
  const ended = span.endedAt ? formatTimestamp(span.endedAt) : "—";

  return (
    <section className="rounded-lg border border-neutral-200 p-5">
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold text-neutral-900">
          {span.name}
        </h3>
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          {span.kind}
          {" · "}
          <span className={isError ? "text-red-600" : "text-neutral-700"}>
            {span.status}
          </span>
        </div>
      </header>

      {isError && span.errorMessage ? (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {span.errorMessage}
        </div>
      ) : null}

      <Section title="Timing">
        <Row label="Started">{formatTimestamp(span.startedAt)}</Row>
        <Row label="Ended">{ended}</Row>
        <Row label="Duration">{duration}</Row>
      </Section>

      {isLlm ? (
        <Section title="Tokens">
          <Row label="Model">{span.model ?? "—"}</Row>
          <Row label="Prompt">{formatTokenCount(span.promptTokens)}</Row>
          <Row label="Completion">
            {formatTokenCount(span.completionTokens)}
          </Row>
          <Row label="Total">{formatTokenCount(span.totalTokens)}</Row>
          <Row label="Cost">{formatCost(span.costUsd)}</Row>
        </Section>
      ) : null}

      <Section title="Input">
        <pre className="max-h-96 overflow-auto rounded bg-neutral-50 p-3 font-mono text-xs text-neutral-800">
          {formatJson(span.input)}
        </pre>
      </Section>

      <Section title="Output">
        <pre className="max-h-96 overflow-auto rounded bg-neutral-50 p-3 font-mono text-xs text-neutral-800">
          {formatJson(span.output)}
        </pre>
      </Section>

      <Section title="Metadata">
        <Row label="Span ID">
          <code className="font-mono text-xs">{span.id}</code>
        </Row>
        <Row label="Parent">
          {span.parentSpanId ? (
            <code className="font-mono text-xs">{span.parentSpanId}</code>
          ) : (
            "—"
          )}
        </Row>
      </Section>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h4>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-0.5">
      <span className="w-28 shrink-0 text-neutral-500">{label}</span>
      <span className="text-neutral-800">{children}</span>
    </div>
  );
}

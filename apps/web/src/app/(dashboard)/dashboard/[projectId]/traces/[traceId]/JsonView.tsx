"use client";

import { useState, type ReactNode } from "react";

const STRING_PREVIEW_LEN = 200;
const NESTED_COLLAPSE_THRESHOLD = 5;
const MAX_RENDER_BYTES = 256 * 1024;

export function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-neutral-500">—</p>;
  }

  let raw: string;
  try {
    raw = JSON.stringify(value, null, 2);
  } catch {
    return <p className="text-sm text-red-600">[unserializable value]</p>;
  }

  if (raw.length > MAX_RENDER_BYTES) {
    return <LargeFallback raw={raw} />;
  }

  return (
    <div className="rounded bg-neutral-50 p-3 font-mono text-xs text-neutral-800">
      <div className="mb-2 flex justify-end">
        <CopyButton text={raw} />
      </div>
      <Node value={value} depth={0} />
    </div>
  );
}

function LargeFallback({ raw }: { raw: string }) {
  const kb = (raw.length / 1024).toFixed(1);
  return (
    <div className="rounded bg-neutral-50 p-3 text-xs text-neutral-700">
      <p className="mb-2">[value too large to render — {kb} KB]</p>
      <CopyButton text={raw} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard API unavailable
        }
      }}
      className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:text-neutral-900"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Node({
  value,
  depth,
  label,
}: {
  value: unknown;
  depth: number;
  label?: string;
}) {
  const prefix =
    label !== undefined ? (
      <>
        <span className="text-neutral-700">&quot;{label}&quot;</span>:{" "}
      </>
    ) : null;

  if (value === null) {
    return (
      <div>
        {prefix}
        <span className="text-neutral-500">null</span>
      </div>
    );
  }
  if (typeof value === "boolean") {
    return (
      <div>
        {prefix}
        <span className="text-purple-700">{String(value)}</span>
      </div>
    );
  }
  if (typeof value === "number") {
    return (
      <div>
        {prefix}
        <span className="text-blue-700">{value}</span>
      </div>
    );
  }
  if (typeof value === "string") {
    return (
      <div>
        {prefix}
        <StringValue value={value} />
      </div>
    );
  }
  if (Array.isArray(value)) {
    return <ArrayNode value={value} depth={depth} prefix={prefix} />;
  }
  if (typeof value === "object") {
    return (
      <ObjectNode
        value={value as Record<string, unknown>}
        depth={depth}
        prefix={prefix}
      />
    );
  }
  return (
    <div>
      {prefix}
      <span className="text-neutral-500">{String(value)}</span>
    </div>
  );
}

function StringValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const display = JSON.stringify(value);

  if (display.length <= STRING_PREVIEW_LEN) {
    return <span className="break-all text-green-700">{display}</span>;
  }

  const moreChars = display.length - STRING_PREVIEW_LEN;
  return (
    <>
      <span className="break-all text-green-700">
        {expanded ? display : `${display.slice(0, STRING_PREVIEW_LEN)}…`}
      </span>{" "}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-neutral-500 hover:text-neutral-900"
      >
        {expanded ? "(collapse)" : `(${moreChars} more chars)`}
      </button>
    </>
  );
}

function ArrayNode({
  value,
  depth,
  prefix,
}: {
  value: unknown[];
  depth: number;
  prefix: ReactNode;
}) {
  const startCollapsed = depth > 0 && value.length > NESTED_COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!startCollapsed);

  if (value.length === 0) {
    return (
      <div>
        {prefix}
        <span>[]</span>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div>
        {prefix}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-neutral-500 hover:text-neutral-900"
        >
          [{value.length} items]
        </button>
      </div>
    );
  }

  return (
    <div>
      <div>
        {prefix}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-neutral-500 hover:text-neutral-900"
        >
          [
        </button>
      </div>
      <div className="ml-4">
        {value.map((item, i) => (
          <Node key={i} value={item} depth={depth + 1} />
        ))}
      </div>
      <div>]</div>
    </div>
  );
}

function ObjectNode({
  value,
  depth,
  prefix,
}: {
  value: Record<string, unknown>;
  depth: number;
  prefix: ReactNode;
}) {
  const keys = Object.keys(value);
  const startCollapsed = depth > 0 && keys.length > NESTED_COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!startCollapsed);

  if (keys.length === 0) {
    return (
      <div>
        {prefix}
        <span>{"{}"}</span>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div>
        {prefix}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-neutral-500 hover:text-neutral-900"
        >
          {`{ ${keys.length} ${keys.length === 1 ? "key" : "keys"} }`}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div>
        {prefix}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-neutral-500 hover:text-neutral-900"
        >
          {"{"}
        </button>
      </div>
      <div className="ml-4">
        {keys.map((k) => (
          <Node key={k} value={value[k]} depth={depth + 1} label={k} />
        ))}
      </div>
      <div>{"}"}</div>
    </div>
  );
}

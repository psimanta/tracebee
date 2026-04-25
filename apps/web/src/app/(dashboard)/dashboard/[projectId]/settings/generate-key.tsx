"use client";

import { useActionState, useState } from "react";

type State = { rawKey: string | null; error: string | null };

const initialState: State = { rawKey: null, error: null };

export function GenerateKey({
  action,
}: {
  action: () => Promise<{ rawKey: string }>;
}) {
  const [state, formAction, pending] = useActionState<State>(async () => {
    try {
      const { rawKey } = await action();
      return { rawKey, error: null };
    } catch {
      return { rawKey: null, error: "Failed to generate key. Try again." };
    }
  }, initialState);

  return (
    <>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate key"}
        </button>
      </form>

      {state.rawKey && <ShowOncePanel rawKey={state.rawKey} />}
      {state.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}
    </>
  );
}

function ShowOncePanel({ rawKey }: { rawKey: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">
        Copy this key now. It won&apos;t be shown again.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 break-all rounded border border-amber-200 bg-white px-3 py-2 text-xs">
          {rawKey}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

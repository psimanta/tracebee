"use client";

import { useTransition } from "react";

export function RevokeKey({
  action,
  keyId,
  keyPrefix,
}: {
  action: (keyId: string) => Promise<void>;
  keyId: string;
  keyPrefix: string;
}) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    const ok = window.confirm(
      `Revoke key ${keyPrefix}…? Any agent using this key will start failing immediately. This cannot be undone.`,
    );
    if (!ok) return;
    startTransition(async () => {
      await action(keyId);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
    >
      {pending ? "Revoking…" : "Revoke"}
    </button>
  );
}

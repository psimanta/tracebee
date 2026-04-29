"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { spans as spansTable } from "@/db/schema";
import { SpanDetail } from "./SpanDetail";
import { Waterfall } from "./Waterfall";

type Span = typeof spansTable.$inferSelect;

export function TraceView({ spans }: { spans: Span[] }) {
  const [selectedId, setSelectedId] = useState<string>(spans[0]!.id);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedIndex = spans.findIndex((s) => s.id === selectedId);
  const selectedSpan = selectedIndex >= 0 ? spans[selectedIndex]! : spans[0]!;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    wrapperRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(selectedIndex + 1, spans.length - 1);
      setSelectedId(spans[next]!.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(selectedIndex - 1, 0);
      setSelectedId(spans[prev]!.id);
    }
  };

  return (
    <div className="space-y-6">
      <div
        ref={wrapperRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Waterfall
          spans={spans}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>
      <SpanDetail span={selectedSpan} />
    </div>
  );
}

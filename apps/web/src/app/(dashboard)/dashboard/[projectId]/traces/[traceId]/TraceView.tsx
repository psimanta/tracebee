"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { spans as spansTable } from "@/db/schema";
import { SpanDetail } from "./SpanDetail";
import { Waterfall } from "./Waterfall";

type Span = typeof spansTable.$inferSelect;

export function TraceView({ spans }: { spans: Span[] }) {
  const [selectedId, setSelectedId] = useState<string>(spans[0]!.id);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedIndex = spans.findIndex((s) => s.id === selectedId);
  const selectedSpan = selectedIndex >= 0 ? spans[selectedIndex]! : spans[0]!;
  const errorSpans = spans.filter((s) => s.status === "error");

  useEffect(() => {
    const row = document.getElementById(`waterfall-row-${selectedId}`);
    if (!row) return;
    const scroller = row.closest<HTMLElement>("[data-waterfall-scroller]");
    if (!scroller) return;

    const rowRect = row.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const STICKY_HEADER_H = 32;
    const visibleTop = scrollerRect.top + STICKY_HEADER_H;
    const visibleBottom = scrollerRect.bottom;

    if (rowRect.top < visibleTop) {
      scroller.scrollTop -= visibleTop - rowRect.top;
    } else if (rowRect.bottom > visibleBottom) {
      scroller.scrollTop += rowRect.bottom - visibleBottom;
    }
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    wrapperRef.current?.focus();
  };

  const jumpToNextError = () => {
    if (errorSpans.length === 0) return;
    const currentErrorIdx = errorSpans.findIndex((s) => s.id === selectedId);
    const nextIdx = (currentErrorIdx + 1) % errorSpans.length;
    handleSelect(errorSpans[nextIdx]!.id);
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div
        ref={wrapperRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:sticky lg:top-4 lg:flex-1 lg:min-w-0"
      >
        {errorSpans.length > 0 ? (
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-red-600">
              {errorSpans.length}{" "}
              {errorSpans.length === 1 ? "error" : "errors"}
            </span>
            <button
              type="button"
              onClick={jumpToNextError}
              className="rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
            >
              Jump to {errorSpans.length === 1 ? "error" : "next error"} →
            </button>
          </div>
        ) : null}
        <Waterfall
          spans={spans}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>
      <div className="lg:w-96 lg:shrink-0">
        <SpanDetail span={selectedSpan} />
      </div>
    </div>
  );
}

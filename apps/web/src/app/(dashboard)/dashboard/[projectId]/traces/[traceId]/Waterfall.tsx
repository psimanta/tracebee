"use client";

import { formatDuration } from "@/lib/format";

type WaterfallSpan = {
  id: string;
  name: string;
  kind: "llm" | "tool";
  status: "ok" | "error";
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
};

const LABEL_WIDTH = 240;
const CHART_WIDTH = 720;
const RIGHT_PADDING = 60;
const BAR_AREA_WIDTH = CHART_WIDTH - RIGHT_PADDING;
const TOTAL_WIDTH = LABEL_WIDTH + CHART_WIDTH;
const ROW_HEIGHT = 28;
const AXIS_HEIGHT = 32;
const BAR_HEIGHT = 16;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const TICK_COUNT = 5;

function colorFor(span: WaterfallSpan): string {
  if (span.status === "error") return "#ef4444";
  return span.kind === "llm" ? "#3b82f6" : "#8b5cf6";
}

export function Waterfall({
  spans,
  selectedId,
  onSelect,
}: {
  spans: WaterfallSpan[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (spans.length === 0) return null;

  const t0 = Math.min(...spans.map((s) => s.startedAt.getTime()));
  const t1 = Math.max(
    ...spans.map((s) => (s.endedAt ?? s.startedAt).getTime()),
  );
  const totalDuration = Math.max(t1 - t0, 1);
  const scale = (t: number) => ((t - t0) / totalDuration) * BAR_AREA_WIDTH;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const fraction = i / (TICK_COUNT - 1);
    return {
      x: fraction * BAR_AREA_WIDTH,
      label: formatDuration(fraction * totalDuration),
    };
  });

  return (
    <div
      className="max-h-[600px] overflow-auto rounded border border-neutral-200"
      data-waterfall-scroller
    >
      <div style={{ width: TOTAL_WIDTH }}>
        <div
          className="sticky top-0 z-20 flex bg-white"
          style={{ height: AXIS_HEIGHT }}
        >
          <div
            className="sticky left-0 z-30 shrink-0 bg-white"
            style={{ width: LABEL_WIDTH, height: AXIS_HEIGHT }}
          />
          <div
            className="relative shrink-0"
            style={{ width: CHART_WIDTH, height: AXIS_HEIGHT }}
          >
            {ticks.map((tick, i) => {
              const transform =
                i === 0
                  ? "none"
                  : i === ticks.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)";
              return (
                <span
                  key={tick.x}
                  className="absolute text-xs text-neutral-500"
                  style={{ left: tick.x, bottom: 8, transform }}
                >
                  {tick.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="relative">
          {ticks.map((tick) => (
            <div
              key={tick.x}
              className="pointer-events-none absolute bg-neutral-200"
              style={{
                left: LABEL_WIDTH + tick.x,
                top: 0,
                bottom: 0,
                width: 1,
              }}
            />
          ))}

          {spans.map((span) => {
            const startMs = span.startedAt.getTime();
            const endMs = (span.endedAt ?? span.startedAt).getTime();
            const x0 = scale(startMs);
            const x1 = scale(endMs);
            const isInstant = span.endedAt === null;
            const barWidth = isInstant ? 2 : Math.max(2, x1 - x0);
            const color = colorFor(span);
            const durationLabel =
              span.durationMs !== null ? formatDuration(span.durationMs) : "—";
            const nameColor = span.status === "error" ? "#dc2626" : "#374151";
            const isSelected = span.id === selectedId;
            const rowBg = isSelected ? "#f3f4f6" : "white";

            return (
              <div
                key={span.id}
                id={`waterfall-row-${span.id}`}
                className="relative flex cursor-pointer"
                style={{ height: ROW_HEIGHT }}
                onClick={() => onSelect(span.id)}
                title={`${span.name} — ${durationLabel}`}
              >
                <div
                  className="sticky left-0 z-10 shrink-0 truncate text-xs"
                  style={{
                    width: LABEL_WIDTH,
                    paddingLeft: 8,
                    paddingRight: 8,
                    lineHeight: `${ROW_HEIGHT}px`,
                    background: rowBg,
                    color: nameColor,
                    fontWeight: 500,
                  }}
                >
                  {span.name}
                </div>

                <div
                  className="relative shrink-0"
                  style={{
                    width: CHART_WIDTH,
                    background: isSelected ? "#f3f4f6" : "transparent",
                  }}
                >
                  <div
                    className="absolute rounded-sm"
                    style={{
                      left: x0,
                      top: BAR_Y_OFFSET,
                      width: barWidth,
                      height: BAR_HEIGHT,
                      background: color,
                    }}
                  />
                  <span
                    className="absolute text-xs text-neutral-500"
                    style={{
                      left: BAR_AREA_WIDTH + 8,
                      top: 0,
                      lineHeight: `${ROW_HEIGHT}px`,
                    }}
                  >
                    {durationLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

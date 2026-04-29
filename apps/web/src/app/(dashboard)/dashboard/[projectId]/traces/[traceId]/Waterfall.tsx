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
const NAME_MAX_CHARS = 30;

function colorFor(span: WaterfallSpan): string {
  if (span.status === "error") return "#ef4444";
  return span.kind === "llm" ? "#3b82f6" : "#8b5cf6";
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
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

  const totalHeight = AXIS_HEIGHT + spans.length * ROW_HEIGHT;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const fraction = i / (TICK_COUNT - 1);
    return {
      x: fraction * BAR_AREA_WIDTH,
      label: formatDuration(fraction * totalDuration),
    };
  });

  return (
    <div className="overflow-x-auto">
      <svg width={TOTAL_WIDTH} height={totalHeight} className="text-xs">
        {ticks.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={LABEL_WIDTH + t.x}
              y1={AXIS_HEIGHT - 4}
              x2={LABEL_WIDTH + t.x}
              y2={totalHeight}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text
              x={LABEL_WIDTH + t.x}
              y={AXIS_HEIGHT - 10}
              textAnchor={
                i === 0
                  ? "start"
                  : i === ticks.length - 1
                    ? "end"
                    : "middle"
              }
              fill="#6b7280"
            >
              {t.label}
            </text>
          </g>
        ))}

        {spans.map((span, i) => {
          const y = AXIS_HEIGHT + i * ROW_HEIGHT;
          const barY = y + BAR_Y_OFFSET;
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

          return (
            <g key={span.id}>
              <title>{`${span.name} — ${durationLabel}`}</title>
              <rect
                x={0}
                y={y}
                width={TOTAL_WIDTH}
                height={ROW_HEIGHT}
                fill={isSelected ? "#f3f4f6" : "transparent"}
                className="cursor-pointer"
                pointerEvents="all"
                onClick={() => onSelect(span.id)}
              />
              <text
                x={8}
                y={y + ROW_HEIGHT / 2}
                dominantBaseline="middle"
                fill={nameColor}
                fontWeight={500}
              >
                {truncate(span.name, NAME_MAX_CHARS)}
              </text>
              <rect
                x={LABEL_WIDTH + x0}
                y={barY}
                width={barWidth}
                height={BAR_HEIGHT}
                fill={color}
                rx={2}
              />
              <text
                x={LABEL_WIDTH + BAR_AREA_WIDTH + 8}
                y={y + ROW_HEIGHT / 2}
                dominantBaseline="middle"
                fill="#6b7280"
              >
                {durationLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

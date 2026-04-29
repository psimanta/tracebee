import Link from "next/link";

const SKELETON_ROW_WIDTHS = [
  ["w-32", "w-10", "w-14", "w-6", "w-14", "w-16"],
  ["w-40", "w-10", "w-12", "w-8", "w-16", "w-14"],
  ["w-28", "w-10", "w-16", "w-6", "w-12", "w-16"],
  ["w-36", "w-10", "w-14", "w-8", "w-14", "w-14"],
  ["w-32", "w-10", "w-12", "w-6", "w-16", "w-16"],
  ["w-44", "w-10", "w-14", "w-6", "w-14", "w-14"],
  ["w-32", "w-10", "w-16", "w-8", "w-12", "w-16"],
];

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard"
        className="text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Back to projects
      </Link>

      <div className="mt-4 h-7 w-48 animate-pulse rounded bg-neutral-200" />

      <div className="mt-3 h-9 border-b border-neutral-200" />

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Duration</th>
            <th className="py-2 pr-4 font-medium">Spans</th>
            <th className="py-2 pr-4 font-medium">Cost</th>
            <th className="py-2 pr-4 font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {SKELETON_ROW_WIDTHS.map((widths, i) => (
            <tr key={i} className="border-b border-neutral-100">
              {widths.map((w, j) => (
                <td key={j} className="py-3 pr-4">
                  <div
                    className={`h-3 ${w} animate-pulse rounded bg-neutral-200`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

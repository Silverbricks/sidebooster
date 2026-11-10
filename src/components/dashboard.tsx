// Shared dashboard building blocks (server components, no client JS).
import Link from "next/link";

const TZ = "Australia/Sydney";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-AU", { timeZone: TZ, day: "numeric", month: "short" }).format(d);

export type DayPoint = { key: string; label: string; value: number };

/** Buckets rows into one point per calendar day (Sydney time) for the last `days` days, oldest first. */
export function dailySeries(rows: { at: Date; value: number }[], days = 30, now = new Date()): DayPoint[] {
  const points: DayPoint[] = [];
  const index = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const p = { key: dayKey(d), label: dayLabel(d), value: 0 };
    points.push(p);
    index.set(p.key, p);
  }
  for (const r of rows) {
    const p = index.get(dayKey(r.at));
    if (p) p.value += r.value;
  }
  return points;
}

/** Single-series daily bar chart. Each bar has a hover tooltip; a hidden table gives screen readers the numbers. */
export function TrendBars({ title, points, format = (n) => n.toLocaleString("en-AU"), total }: {
  title: string; points: DayPoint[]; format?: (n: number) => string; total?: string;
}) {
  const W = 600, H = 140, PAD_B = 18, gap = 2;
  const max = Math.max(1, ...points.map((p) => p.value));
  const bw = W / points.length;
  const sum = points.reduce((a, p) => a + p.value, 0);
  return (
    <figure className="card card-pad">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{title}</span>
        <span className="text-lg font-bold tabular-nums">{total ?? format(sum)}</span>
      </figcaption>
      {sum === 0 ? (
        <p className="mt-6 mb-4 text-center text-sm text-muted">Nothing yet in the last {points.length} days.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-36 w-full" role="img" aria-label={`${title}: ${format(sum)} over ${points.length} days`} preserveAspectRatio="none">
          <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--color-line)" strokeWidth="1" />
          {points.map((p, i) => {
            const h = p.value ? Math.max(3, ((H - PAD_B - 6) * p.value) / max) : 0;
            const x = i * bw + gap / 2;
            return (
              <g key={p.key} className="group">
                {/* hit target is the full column, larger than the bar */}
                <rect x={i * bw} y="0" width={bw} height={H - PAD_B} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${H - PAD_B} v${-(h - 3)} q0,-3 3,-3 h${bw - gap - 6} q3,0 3,3 v${h - 3} z`}
                    className="fill-brand-500 group-hover:fill-brand-700"
                  />
                )}
                <title>{`${p.label}: ${format(p.value)}`}</title>
              </g>
            );
          })}
          <text x="0" y={H - 4} fontSize="11" fill="var(--color-muted)">{points[0]?.label}</text>
          <text x={W} y={H - 4} fontSize="11" fill="var(--color-muted)" textAnchor="end">{points.at(-1)?.label}</text>
        </svg>
      )}
      <table className="sr-only">
        <caption>{title} by day</caption>
        <tbody>{points.map((p) => <tr key={p.key}><th>{p.label}</th><td>{format(p.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export type ActionItem = { label: string; count: number; href: string; tone?: "warn" | "info"; hint?: string };

/** "Needs your attention" list. Items with a zero count are hidden; shows an all-clear message when empty. */
export function ActionList({ items, clear = "You're all caught up." }: { items: ActionItem[]; clear?: string }) {
  const open = items.filter((i) => i.count > 0);
  if (!open.length) return <p className="text-sm text-emerald-700">✔ {clear}</p>;
  return (
    <ul className="space-y-2">
      {open.map((i) => (
        <li key={i.label}>
          <Link href={i.href} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm hover:bg-slate-50">
            <span>
              <span className="font-medium">{i.label}</span>
              {i.hint && <span className="block text-xs text-muted">{i.hint}</span>}
            </span>
            <span className={`shrink-0 rounded-full px-2 text-xs font-semibold ${i.tone === "info" ? "bg-brand-100 text-brand-700" : "bg-amber-500 text-white"}`}>{i.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Compact list of recent rows with a right-hand value. */
export function RecentList({ rows, empty }: { rows: { key: string; href?: string; title: React.ReactNode; meta?: React.ReactNode; right?: React.ReactNode }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const body = (
          <>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{r.title}</span>
              {r.meta && <span className="block truncate text-xs text-muted">{r.meta}</span>}
            </span>
            {r.right && <span className="shrink-0 text-right text-sm">{r.right}</span>}
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? <Link href={r.href} className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-slate-50">{body}</Link> : <div className="flex items-center justify-between gap-3 py-2">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function QuickLinks({ links }: { links: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(([label, href]) => <Link key={href} href={href} className="btn-secondary btn-sm">{label}</Link>)}
    </div>
  );
}

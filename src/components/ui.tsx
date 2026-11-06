import Link from "next/link";
import { tone } from "@/lib/constants";

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function Badge({ status, labels, children }: { status: string; labels?: Record<string, string>; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone(status)]}`}>
      {children ?? labels?.[status] ?? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}

export function PublicStatusBadge({ status }: { status: string }) {
  const map: Record<string, keyof typeof TONES> = {
    Upcoming: "blue",
    "Ticket Sales Open": "green",
    "Sales Closed": "amber",
    "Draw Scheduled": "amber",
    "Draw Completed": "blue",
    "Winner Announced": "green",
    Cancelled: "red",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[map[status] ?? "gray"]}`}>{status}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const error = typeof sp.error === "string" ? sp.error : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  if (!error && !ok) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-5 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {error ?? ok}
    </div>
  );
}

export function Field({ label, name, hint, children, required }: { label: string; name?: string; hint?: string; children?: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="h2">{title}</h2>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[180px_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="break-words font-medium">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pager({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mt-6 flex items-center justify-center gap-2 text-sm">
      {page > 1 && <Link className="btn-secondary btn-sm" href={`${base}${sep}page=${page - 1}`}>Previous</Link>}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages && <Link className="btn-secondary btn-sm" href={`${base}${sep}page=${page + 1}`}>Next</Link>}
    </div>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

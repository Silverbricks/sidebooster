import Link from "next/link";

export type NavItem = { href: string; label: string; badge?: number } | { heading: string };

export function DashboardShell({ title, idLine, nav, children }: { title: string; idLine?: React.ReactNode; nav: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[230px_1fr]">
      <aside className="lg:sticky lg:top-28 lg:h-fit">
        <div className="mb-3 px-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>
          {idLine && <div className="mt-1 text-sm">{idLine}</div>}
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label={title}>
          {nav.map((n, i) =>
            "heading" in n ? (
              <div key={i} className="hidden px-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted lg:block">{n.heading}</div>
            ) : (
              <Link key={n.href} href={n.href} className="flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-white hover:shadow-sm">
                {n.label}
                {!!n.badge && <span className="ml-2 rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{n.badge}</span>}
              </Link>
            ),
          )}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

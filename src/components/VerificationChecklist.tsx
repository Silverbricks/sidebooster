import type { CheckItem } from "@/lib/seller-verification";

const ICON: Record<CheckItem["state"], { icon: string; cls: string; label: string }> = {
  done: { icon: "✔", cls: "bg-emerald-100 text-emerald-700", label: "Done" },
  pending: { icon: "…", cls: "bg-amber-100 text-amber-800", label: "Pending" },
  problem: { icon: "!", cls: "bg-red-100 text-red-700", label: "Needs attention" },
  na: { icon: "–", cls: "bg-slate-100 text-slate-500", label: "Not required" },
};

/** Registration → Mobile OTP → ABN/ACN → Location → Identity/Age → Terms → Admin review. */
export function VerificationChecklist({ items }: { items: CheckItem[] }) {
  return (
    <ol className="divide-y divide-line">
      {items.map((i, n) => {
        const s = ICON[i.state];
        return (
          <li key={i.key} className="flex items-start gap-3 py-2.5 text-sm">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.cls}`} aria-label={s.label}>{s.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{n + 1}. {i.label} <span className="ml-1 text-xs font-normal text-muted">· {s.label}</span></div>
              <div className="text-xs text-muted">{i.detail}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

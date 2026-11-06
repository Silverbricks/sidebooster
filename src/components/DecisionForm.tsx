import { SubmitButton } from "./SubmitButton";

type Btn = { value: string; label: string; className?: string; confirm?: string };

/** One form: optional reason field + several decision buttons (name="decision"). */
export function DecisionForm({ action, hidden, buttons, reasonPlaceholder = "Reason (required for rejections)", name = "decision", children, reason = true }: {
  action: (fd: FormData) => void; hidden: Record<string, string>; buttons: Btn[]; reasonPlaceholder?: string; name?: string; children?: React.ReactNode; reason?: boolean;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {reason && <input name="reason" className="input min-w-48 flex-1 py-1.5 text-xs" placeholder={reasonPlaceholder} aria-label="Reason" />}
      {buttons.map((b) => <SubmitButton key={b.value} name={name} value={b.value} className={b.className ?? "btn-secondary btn-sm"} confirm={b.confirm}>{b.label}</SubmitButton>)}
    </form>
  );
}

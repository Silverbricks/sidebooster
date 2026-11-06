import { getSettings, SETTING_LABELS, DEFAULT_SETTINGS, type SettingKey } from "@/lib/settings";
import { Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveSettingsAction } from "@/app/actions/admin";

export const metadata = { title: "Settings & approval rules" };

const TEXT: [SettingKey, string, string][] = [
  ["site_name", "Site name", ""],
  ["support_email", "Support email", ""],
  ["default_commission_bps", "Default commission (basis points)", "500 = 5%. Category and seller rates override this."],
  ["commission_invoice_due_days", "Commission invoice due (days)", ""],
  ["payment_expiry_minutes", "Checkout expiry (minutes)", "Unpaid checkouts are cancelled after this time and never hold stock or tickets."],
  ["max_tickets_per_order", "Max tickets per order", ""],
  ["paid_entry_blocked_states", "States where paid entry is blocked", "Comma separated, e.g. VIC,NSW. Confirm with legal advice."],
];

export default async function AdminSettings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const bools = (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).filter((k) => ["true", "false"].includes(DEFAULT_SETTINGS[k]));
  const rules = bools.filter((k) => k.startsWith("rule_"));
  const promo = bools.filter((k) => !k.startsWith("rule_"));
  const Toggle = ({ k }: { k: SettingKey }) => (
    <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
      <input type="checkbox" name={k} defaultChecked={s[k] === "true"} className="mt-1" />
      <span><b>{SETTING_LABELS[k]?.[0] ?? k}</b>{SETTING_LABELS[k]?.[1] && <span className="block text-xs text-muted">{SETTING_LABELS[k]![1]}</span>}</span>
    </label>
  );
  return (
    <form action={saveSettingsAction} className="space-y-6">
      <PageHeader title="Settings & approval engine" subtitle="Central approval rules — change business rules without code changes. Every change is audit-logged." actions={<SubmitButton>Save all</SubmitButton>} />
      <Flash sp={sp} />
      <Section title="Approval rules"><div className="grid gap-3 md:grid-cols-2">{rules.map((k) => <Toggle key={k} k={k} />)}</div></Section>
      <Section title="Promotions & legal safeguards">
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A software setting cannot make an unlawful lottery lawful. Enable paid campaigns only after obtaining Australian gaming / trade-promotion legal advice for the model and each state where it is advertised.</div>
        <div className="grid gap-3 md:grid-cols-2">{promo.map((k) => <Toggle key={k} k={k} />)}</div>
      </Section>
      <Section title="Platform values">
        <div className="grid gap-4 md:grid-cols-2">
          {TEXT.map(([k, label, hint]) => <div key={k}><label className="label" htmlFor={k}>{label}</label><input id={k} name={k} defaultValue={s[k]} className="input" />{hint && <p className="hint">{hint}</p>}</div>)}
        </div>
      </Section>
      <div><label className="label" htmlFor="reason">Reason for change (recorded)</label><input id="reason" name="reason" className="input" /></div>
      <SubmitButton>Save all</SubmitButton>
    </form>
  );
}

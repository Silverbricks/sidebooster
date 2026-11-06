import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { pct } from "@/lib/commission";
import { getNumber } from "@/lib/settings";
import { saveCommissionRuleAction } from "@/app/actions/admin";

export const metadata = { title: "Commission rates" };

export default async function CommissionRules({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [categories, rules, def, sellerRules] = await Promise.all([
    db.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
    db.commissionRule.findMany({ where: { sellerId: null }, orderBy: { effectiveFrom: "desc" } }),
    getNumber("default_commission_bps"),
    db.commissionRule.findMany({ where: { sellerId: { not: null }, effectiveTo: null } }),
  ]);
  const sellerCodes = new Map((await db.sellerProfile.findMany({ where: { userId: { in: sellerRules.map((r) => r.sellerId!) } }, select: { userId: true, sellerCode: true } })).map((s) => [s.userId, s.sellerCode]));
  return (
    <div className="space-y-6">
      <PageHeader title="Commission rates" subtitle={`Platform default ${pct(def)} (Settings). Category rules override it; seller-specific agreements override categories. New rates apply to sales from the effective date — existing records never change silently.`} />
      <Flash sp={sp} />
      <Section title="Category rates">
        <div className="space-y-3">
          {categories.map((c) => {
            const current = rules.find((r) => r.categoryId === c.id && r.effectiveFrom <= new Date() && (!r.effectiveTo || r.effectiveTo > new Date()));
            const history = rules.filter((r) => r.categoryId === c.id);
            return (
              <div key={c.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{c.icon} {c.name}: {pct(current?.rateBps ?? def)}</span>
                  <form action={saveCommissionRuleAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="categoryId" value={c.id} />
                    <input name="rate" className="input w-20" placeholder="%" inputMode="decimal" required aria-label="Rate" />
                    <input name="effectiveFrom" type="date" className="input w-40" aria-label="Effective from" />
                    <input name="reason" className="input w-56" placeholder="Reason" required aria-label="Reason" />
                    <SubmitButton className="btn-secondary btn-sm">Set rate</SubmitButton>
                  </form>
                </div>
                {history.length > 1 && <div className="mt-1 text-xs text-muted">History: {history.map((h) => `${pct(h.rateBps)} from ${date(h.effectiveFrom)}${h.effectiveTo ? ` to ${date(h.effectiveTo)}` : ""}`).join(" · ")}</div>}
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Seller-specific agreements">
        {sellerRules.length ? <ul className="text-sm">{sellerRules.map((r) => <li key={r.id}><span className="font-mono">{sellerCodes.get(r.sellerId!)}</span>: {pct(r.rateBps)} since {date(r.effectiveFrom)}</li>)}</ul> : <p className="text-sm text-muted">None. Set them from a seller&apos;s admin page.</p>}
      </Section>
    </div>
  );
}

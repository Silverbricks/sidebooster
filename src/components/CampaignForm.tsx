import type { Campaign } from "@prisma/client";
import { AU_STATES, TIMEZONES } from "@/lib/constants";
import { utcToZonedInput } from "@/lib/time";
import { SubmitButton } from "./SubmitButton";

const d = (c?: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));

export function CampaignForm({
  action, c, listings, defaultListing, canFree, canPaid, paidEnabled, blockedStates, soldOutAllowed,
}: {
  action: (fd: FormData) => void; c?: Campaign | null; listings: { id: string; title: string }[]; defaultListing?: string;
  canFree: boolean; canPaid: boolean; paidEnabled: boolean; blockedStates: string[]; soldOutAllowed: boolean;
}) {
  const tz = c?.timezone ?? "Australia/Sydney";
  const states = (c?.allowedStates ?? "").split(",").filter(Boolean);
  return (
    <form action={action} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <section className="card card-pad space-y-4">
        <h2 className="h2">1. Campaign & prize</h2>
        <div><label className="label" htmlFor="listingId">Promoted product (must be approved)</label>
          <select id="listingId" name="listingId" defaultValue={c?.listingId ?? defaultListing ?? ""} className="input"><option value="">None</option>{listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></div>
        <div><label className="label" htmlFor="title">Campaign title *</label><input id="title" name="title" defaultValue={c?.title} className="input" required /></div>
        <div><label className="label" htmlFor="description">Campaign description *</label><textarea id="description" name="description" defaultValue={c?.description} rows={4} className="input" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="prizeName">Prize name *</label><input id="prizeName" name="prizeName" defaultValue={c?.prizeName} className="input" required /></div>
          <div><label className="label" htmlFor="prizeValue">Prize value (AUD) *</label><input id="prizeValue" name="prizeValue" defaultValue={d(c?.prizeValue)} className="input" inputMode="decimal" required /></div>
        </div>
        <div><label className="label" htmlFor="images">Prize images</label><input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="input" /></div>
        <div><label className="label" htmlFor="prizeDelivery">Prize delivery or collection details *</label><textarea id="prizeDelivery" name="prizeDelivery" defaultValue={c?.prizeDelivery} rows={2} className="input" required /></div>
      </section>

      <section className="card card-pad space-y-4">
        <h2 className="h2">2. Tickets</h2>
        <fieldset><legend className="label">Ticket type (one type per campaign)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`card flex items-start gap-3 p-4 ${!canFree ? "opacity-50" : ""}`}><input type="radio" name="ticketType" value="FREE" defaultChecked={(c?.ticketType ?? "FREE") === "FREE"} disabled={!canFree} className="mt-1" /><span><b>Free tickets / coupons</b><span className="block text-xs text-muted">Buyers claim free entries. Suitable for trade promotions.</span></span></label>
            <label className={`card flex items-start gap-3 p-4 ${!canPaid || !paidEnabled ? "opacity-50" : ""}`}><input type="radio" name="ticketType" value="PAID" defaultChecked={c?.ticketType === "PAID"} disabled={!canPaid || !paidEnabled} className="mt-1" /><span><b>Paid tickets</b><span className="block text-xs text-muted">{!paidEnabled ? "Disabled platform-wide pending legal advice." : !canPaid ? "Requires platform permission." : `Not permitted in ${blockedStates.join(", ")}. Permit/licence may be required.`}</span></span></label>
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="ticketPrice">Ticket price (paid only)</label><input id="ticketPrice" name="ticketPrice" defaultValue={d(c?.ticketPrice)} className="input" inputMode="decimal" /></div>
          <div><label className="label" htmlFor="totalTickets">Total tickets *</label><input id="totalTickets" name="totalTickets" type="number" min={1} defaultValue={c?.totalTickets ?? 1000} className="input" required /></div>
          <div><label className="label" htmlFor="maxPerBuyer">Max per buyer *</label><input id="maxPerBuyer" name="maxPerBuyer" type="number" min={1} defaultValue={c?.maxPerBuyer ?? 10} className="input" required /></div>
        </div>
      </section>

      <section className="card card-pad space-y-4">
        <h2 className="h2">3. Dates & draw (proposed — admin approval required)</h2>
        <div><label className="label" htmlFor="timezone">Time zone</label><select id="timezone" name="timezone" defaultValue={tz} className="input">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="salesOpenAt">Ticket sales open *</label><input id="salesOpenAt" name="salesOpenAt" type="datetime-local" defaultValue={utcToZonedInput(c?.salesOpenAt, tz)} className="input" required /></div>
          <div><label className="label" htmlFor="salesCloseAt">Ticket sales close *</label><input id="salesCloseAt" name="salesCloseAt" type="datetime-local" defaultValue={utcToZonedInput(c?.salesCloseAt, tz)} className="input" required /></div>
          <div><label className="label" htmlFor="drawAt">Draw date & time *</label><input id="drawAt" name="drawAt" type="datetime-local" defaultValue={utcToZonedInput(c?.drawAt, tz)} className="input" required /></div>
        </div>
        <fieldset><legend className="label">Draw trigger</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="drawMode" value="FIXED" defaultChecked={(c?.drawMode ?? "FIXED") === "FIXED"} /> Mode A — fixed date draw</label>
          <label className={`flex items-center gap-2 text-sm ${!soldOutAllowed ? "opacity-50" : ""}`}><input type="radio" name="drawMode" value="SOLD_OUT" defaultChecked={c?.drawMode === "SOLD_OUT"} disabled={!soldOutAllowed} /> Mode B — sold-out trigger (only if the approved terms allow it){!soldOutAllowed && " — not enabled on this platform"}</label>
        </fieldset>
        <div><label className="label" htmlFor="fallbackProcedure">If the draw can&apos;t proceed / extension not permitted</label><input id="fallbackProcedure" name="fallbackProcedure" defaultValue={c?.fallbackProcedure ?? ""} className="input" placeholder="e.g. Draw proceeds on the published date with entries received." /></div>
      </section>

      <section className="card card-pad space-y-4">
        <h2 className="h2">4. Terms, eligibility & compliance</h2>
        <div><label className="label" htmlFor="terms">Draw terms & conditions *</label><textarea id="terms" name="terms" defaultValue={c?.terms} rows={6} className="input" required /></div>
        <fieldset><legend className="label">Permitted states (leave all unticked = all states; paid campaigns must list states)</legend>
          <div className="flex flex-wrap gap-3 text-sm">{AU_STATES.map((s) => <label key={s.code} className="flex items-center gap-1"><input type="checkbox" name="allowedStates" value={s.code} defaultChecked={states.includes(s.code)} />{s.code}{blockedStates.includes(s.code) && <span className="text-xs text-muted">(free only)</span>}</label>)}</div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="minAge">Minimum age</label><input id="minAge" name="minAge" type="number" min={18} defaultValue={c?.minAge ?? 18} className="input" /></div>
          <div><label className="label" htmlFor="permitNumber">Permit / licence number(s)</label><input id="permitNumber" name="permitNumber" defaultValue={c?.permitNumber ?? ""} className="input" /></div>
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="requireIdVerification" defaultChecked={c?.requireIdVerification} /> Require identity verification</label>
        </div>
        <div><label className="label" htmlFor="legalNotes">Notes for compliance review</label><textarea id="legalNotes" name="legalNotes" defaultValue={c?.legalNotes ?? ""} rows={2} className="input" /></div>
      </section>

      <div className="flex gap-2">
        <SubmitButton name="intent" value="draft" className="btn-secondary">Save draft</SubmitButton>
        <SubmitButton name="intent" value="submit">Submit for approval</SubmitButton>
      </div>
    </form>
  );
}

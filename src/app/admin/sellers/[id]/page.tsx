import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dateTime, money } from "@/lib/format";
import { Badge, Flash, KV, PageHeader, Section } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ACCOUNT_STATUS, DOCUMENT_TYPES, SELLER_STATUS } from "@/lib/constants";
import { documentDecisionAction, sellerCommissionRateAction, sellerDecisionAction, sellerPermissionsAction } from "@/app/actions/admin";
import { pct } from "@/lib/commission";
import { MapPin } from "@/components/MapPin";
import { VerificationChecklist } from "@/components/VerificationChecklist";
import { sellerBusinessDecisionAction, sellerLocationDecisionAction } from "@/app/actions/admin";
import { BUSINESS_STRUCTURES, formatDob } from "@/lib/au-validation";
import { BUSINESS_CHECK_STATUS, LOCATION_STATUS } from "@/lib/seller-location";
import { approvalProblems, oneLine, readStoredLocation, sellerChecklist, structureOf } from "@/lib/seller-verification";
import type { BusinessCheck } from "@/lib/abr";

export const metadata = { title: "Seller review" };

export default async function AdminSeller({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await db.sellerProfile.findUnique({ where: { id }, include: { user: true, documents: { orderBy: { createdAt: "desc" } }, paymentAccount: true } });
  if (!s) notFound();
  const [history, rule, listings, sales] = await Promise.all([
    db.auditLog.findMany({ where: { OR: [{ entityType: "SellerProfile", entityId: id }, { entityType: "User", entityId: s.userId }] }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.commissionRule.findFirst({ where: { sellerId: s.userId, effectiveTo: null } }),
    db.listing.count({ where: { sellerId: s.userId } }),
    db.sale.aggregate({ where: { sellerId: s.userId, status: "APPROVED" }, _sum: { salePrice: true }, _count: true }),
  ]);
  const u = s.user;
  const [checklist, blockers, consents] = await Promise.all([
    sellerChecklist(u, s),
    approvalProblems(u, s),
    db.consentRecord.findMany({ where: { userId: u.id }, orderBy: { acceptedAt: "desc" }, take: 12 }),
  ]);
  const loc = readStoredLocation(s);
  const biz = (s.businessCheckData ?? null) as BusinessCheck | null;
  const abr = biz?.abn ?? biz?.acnRecord ?? null;
  const structure = structureOf(s);
  const compareAddr = loc.business ?? loc.residential;
  const abrPostcodeMatch = abr?.postcode && compareAddr ? abr.postcode === compareAddr.postcode : null;
  const decisions = [
    ...(["UNDER_REVIEW", "DOCUMENTS_REQUIRED", "VERIFICATION_PENDING", "REJECTED"].includes(s.status) ? [{ value: "APPROVE", label: "Approve seller", className: "btn-success btn-sm" }, { value: "DOCUMENTS_REQUIRED", label: "Request more information" }, { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" }] : []),
    ...(["APPROVED", "ACTIVE"].includes(s.status) ? [{ value: "SUSPEND", label: "Suspend seller", className: "btn-danger btn-sm", confirm: "Suspend this seller and all their listings?" }] : []),
    ...(s.status === "SUSPENDED" ? [{ value: "REINSTATE", label: "Reinstate" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`${s.sellerCode} — ${s.legalName}`} subtitle={<><Badge status={s.status} labels={SELLER_STATUS} /> {s.statusReason && <span className="ml-2">{s.statusReason}</span>}</>} />
      <Flash sp={sp} />
      {decisions.length > 0 && (
        <div className="card card-pad space-y-2">
          {blockers.length > 0 && ["UNDER_REVIEW", "DOCUMENTS_REQUIRED", "VERIFICATION_PENDING"].includes(s.status) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <b>Approval is blocked until every mandatory check is complete:</b>
              <ul className="mt-1 list-disc pl-5 text-xs">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          <DecisionForm action={sellerDecisionAction} hidden={{ id: s.id }} buttons={decisions} />
        </div>
      )}
      <Section title="Verification checklist"><VerificationChecklist items={checklist} /></Section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="ABN / ACN validation">
          <KV rows={[
            ["Registration type", BUSINESS_STRUCTURES[structure].label],
            ["ABN", s.abn ?? "—"], ["ACN", s.acn ?? "—"],
            ["Ownership confirmed by seller", s.abnConfirmedAt ? dateTime(s.abnConfirmedAt) : "No"],
            ["Status", <Badge key="b" status={s.businessCheckStatus} labels={BUSINESS_CHECK_STATUS} />],
            ["Checked", s.businessCheckedAt ? `${dateTime(s.businessCheckedAt)}${s.businessVerifiedById ? " (manual decision)" : ""}` : "Never"],
            ...(abr ? ([
              ["ABR entity name", abr.entityName], ["ABR entity type", abr.entityTypeName], ["ABN status", `${abr.abnStatus}${abr.abnStatusFrom ? ` from ${abr.abnStatusFrom}` : ""}`],
              ["GST", abr.gstRegistered ? `Registered${abr.gstFrom ? ` from ${abr.gstFrom}` : ""}` : "Not registered"], ["ABR ACN", abr.acn ?? "—"],
              ["ABR location", [abr.state, abr.postcode].filter(Boolean).join(" ") || "—"], ["Business names", abr.businessNames.join(", ") || "—"],
            ] as [string, React.ReactNode][]) : []),
          ]} />
          {biz?.problems?.length ? <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{biz.problems.map((x) => <li key={x}>{x}</li>)}</ul> : null}
          {s.abn && <p className="mt-2 text-xs"><a className="link" target="_blank" rel="noreferrer" href={`https://abr.business.gov.au/ABN/View?abn=${s.abn}`}>Open on ABN Lookup ↗</a>{s.acn && <> · <a className="link" target="_blank" rel="noreferrer" href="https://connectonline.asic.gov.au/">ASIC Connect ↗</a></>}</p>}
          {(s.abn || s.acn) && (
            <div className="mt-3"><DecisionForm action={sellerBusinessDecisionAction} hidden={{ id: s.id }} reasonPlaceholder="Reason / evidence (required to verify or flag)" buttons={[{ value: "RECHECK", label: "Re-check ABR" }, { value: "VERIFIED", label: "Mark verified", className: "btn-success btn-sm" }, { value: "MISMATCH", label: "Flag mismatch", className: "btn-danger btn-sm" }]} /></div>
          )}
        </Section>
        <Section title="Location verification">
          <KV rows={[
            ["Status", <Badge key="l" status={s.locationStatus} labels={LOCATION_STATUS} />],
            ["Residential address", loc.residential ? oneLine(loc.residential) : s.address],
            ["Business address", loc.business ? oneLine(loc.business) : "Same as residential"],
            ["Pin confirmed", s.pinConfirmedAt ? dateTime(s.pinConfirmedAt) : "No"],
            ["Geocoded as", loc.geo?.geocoded ? `${loc.geo.geocoded.formatted} (${loc.geo.geocoded.precision}, ${loc.geo.geocoded.provider})` : "Not found"],
            ["Pin distance from address", loc.geo?.distanceM != null ? `${loc.geo.distanceM} m` : "—"],
            ["Pin coordinates", loc.geo?.pin ? `${loc.geo.pin.lat}, ${loc.geo.pin.lng}` : "—"],
            ["ABR postcode cross-check", abrPostcodeMatch == null ? "n/a" : abrPostcodeMatch ? `✅ matches (${abr?.postcode})` : `⚠ ABR postcode ${abr?.postcode}`],
            ["Method", s.locationMethod === "MANUAL" ? "Manual admin decision" : s.locationMethod === "AUTO_DOCUMENT" ? "Address checks + accepted proof of address" : "—"],
            ["Notes", s.locationNotes ?? "—"],
          ]} />
          {loc.geo?.pin && <div className="mt-3"><MapPin pin={loc.geo.pin} reference={loc.geo.geocoded} height={240} /><p className="mt-1 text-xs text-muted">Purple = seller&apos;s confirmed pin · grey = where the address geocodes.</p></div>}
          <div className="mt-3"><DecisionForm action={sellerLocationDecisionAction} hidden={{ id: s.id }} reasonPlaceholder="Reason (required to fail / send to review)" buttons={[{ value: "VERIFIED", label: "Mark location verified", className: "btn-success btn-sm" }, { value: "MANUAL_REVIEW", label: "Needs review" }, { value: "FAILED", label: "Fail", className: "btn-danger btn-sm" }]} /></div>
        </Section>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Seller details">
          <KV rows={[
            ["Type", `${s.sellerType} · ${BUSINESS_STRUCTURES[structure].label}`], ["Legal name", s.legalName], ["Trading name", s.businessName], ["ABN / ACN", [s.abn, s.acn].filter(Boolean).join(" / ") || "—"], ["Authorised rep", s.authorisedRep],
            ["Locality", s.address], ["Applied", dateTime(s.createdAt)], ["Approved", dateTime(s.approvedAt)],
            ["Listings", listings], ["Approved sales", `${sales._count} · ${money(sales._sum.salePrice ?? 0)}`],
          ]} />
        </Section>
        <Section title="Account & verification">
          <KV rows={[
            ["User ID", <span key="i" className="font-mono">{u.publicId}</span>], ["Account", <Badge key="a" status={u.accountStatus} labels={ACCOUNT_STATUS} />],
            ["Email", `${u.email} ${u.emailVerifiedAt ? "✅" : "⬜"}`],
            ["Mobile OTP", `${u.mobile ?? "—"} — ${u.mobileVerifiedAt ? `verified ${dateTime(u.mobileVerifiedAt)}` : u.mobileOtpExpires && u.mobileOtpExpires > new Date() ? `code sent, ${u.mobileOtpTries} failed attempt(s)` : "not verified"}`],
            ["Date of birth", formatDob(u.dateOfBirth)], ["Risk flags", u.riskFlags ?? "None"],
            ["Marketing opt-in", u.marketingOptIn ? `Yes (${dateTime(u.marketingOptInAt)})` : "No"],
            ["Payout account", s.paymentAccount ? `${s.paymentAccount.provider} · payouts ${s.paymentAccount.payoutsEnabled ? "enabled" : "not enabled"}${s.paymentAccount.restricted ? " · RESTRICTED" : ""}` : "Not connected"],
          ]} />
        </Section>
      </div>
      <Section title="Verification documents">
        {s.documents.length ? (
          <table className="table"><thead><tr><th>Type</th><th>File</th><th>Uploaded</th><th>Status</th><th>Review</th></tr></thead>
            <tbody>{s.documents.map((d) => (
              <tr key={d.id}>
                <td>{DOCUMENT_TYPES[d.documentType]}</td><td><a className="link" href={`/api/documents/${d.id}`} target="_blank">{d.fileName}</a></td><td>{dateTime(d.createdAt)}</td>
                <td><Badge status={d.status} />{d.reviewNote && <div className="text-xs text-muted">{d.reviewNote}</div>}</td>
                <td><DecisionForm action={documentDecisionAction} name="status" hidden={{ id: d.id }} buttons={[{ value: "ACCEPTED", label: "Accept" }, { value: "REJECTED", label: "Reject" }]} reasonPlaceholder="Note" /></td>
              </tr>
            ))}</tbody></table>
        ) : <p className="text-sm text-muted">No documents uploaded.</p>}
      </Section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Permissions & payout controls">
          <form action={sellerPermissionsAction} className="space-y-2 text-sm">
            <input type="hidden" name="id" value={s.id} />
            <label className="flex items-center gap-2"><input type="checkbox" name="canRunFreeDraws" defaultChecked={s.canRunFreeDraws} /> May request free-entry campaigns</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="canRunPaidDraws" defaultChecked={s.canRunPaidDraws} /> May request paid-ticket campaigns (legal clearance required)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="trustedSeller" defaultChecked={s.trustedSeller} /> Trusted seller (listing auto-approval, if the rule is enabled)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="payoutsHeld" defaultChecked={s.paymentAccount?.payoutsHeld} disabled={!s.paymentAccount} /> Hold all payouts (fraud / dispute)</label>
            <input name="reason" className="input" placeholder="Reason (recorded in audit log)" aria-label="Reason" />
            <SubmitButton className="btn-primary btn-sm">Save permissions</SubmitButton>
          </form>
        </Section>
        <Section title="Seller-specific commission rate">
          <p className="mb-2 text-sm">Current: <b>{rule ? pct(rule.rateBps) : "category defaults"}</b></p>
          <form action={sellerCommissionRateAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={s.id} />
            <input name="rate" className="input w-28" placeholder="% (blank = default)" inputMode="decimal" aria-label="Rate" />
            <input name="reason" className="input flex-1" placeholder="Reason / agreement reference" required aria-label="Reason" />
            <SubmitButton className="btn-secondary btn-sm">Set rate</SubmitButton>
          </form>
        </Section>
      </div>
      <Section title="Consent records">
        {consents.length ? (
          <table className="table"><thead><tr><th>Type</th><th>Version</th><th>Accepted</th><th>IP</th></tr></thead>
            <tbody>{consents.map((c) => <tr key={c.id}><td>{c.type}</td><td className="font-mono text-xs">{c.version}</td><td>{dateTime(c.acceptedAt)}</td><td className="font-mono text-xs">{c.ip ?? "—"}</td></tr>)}</tbody></table>
        ) : <p className="text-sm text-muted">{u.termsAcceptedAt ? `Terms accepted ${dateTime(u.termsAcceptedAt)} (before versioned consent records).` : "No consent recorded."}</p>}
      </Section>
      <Section title="Approval log">
        <ul className="space-y-1 text-sm">{history.map((h) => <li key={h.id}><span className="text-muted">{dateTime(h.createdAt)}</span> — {h.action.replace(/_/g, " ").toLowerCase()}{h.reason && <>: <i>{h.reason}</i></>}</li>)}</ul>
      </Section>
    </div>
  );
}

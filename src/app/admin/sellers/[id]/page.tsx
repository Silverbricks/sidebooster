import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dateTime, money } from "@/lib/format";
import { Badge, Flash, KV, PageHeader, Section } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ACCOUNT_STATUS, DOCUMENT_TYPES, SELLER_STATUS } from "@/lib/constants";
import { documentDecisionAction, sellerCommissionRateAction, sellerDecisionAction, sellerPermissionsAction } from "@/app/actions/admin";
import { pct } from "@/lib/commission";

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
  const decisions = [
    ...(["UNDER_REVIEW", "DOCUMENTS_REQUIRED", "VERIFICATION_PENDING", "REJECTED"].includes(s.status) ? [{ value: "APPROVE", label: "Approve seller", className: "btn-success btn-sm" }, { value: "DOCUMENTS_REQUIRED", label: "Request more information" }, { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" }] : []),
    ...(["APPROVED", "ACTIVE"].includes(s.status) ? [{ value: "SUSPEND", label: "Suspend seller", className: "btn-danger btn-sm", confirm: "Suspend this seller and all their listings?" }] : []),
    ...(s.status === "SUSPENDED" ? [{ value: "REINSTATE", label: "Reinstate" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`${s.sellerCode} — ${s.legalName}`} subtitle={<><Badge status={s.status} labels={SELLER_STATUS} /> {s.statusReason && <span className="ml-2">{s.statusReason}</span>}</>} />
      <Flash sp={sp} />
      {decisions.length > 0 && <div className="card card-pad"><DecisionForm action={sellerDecisionAction} hidden={{ id: s.id }} buttons={decisions} /></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Seller details">
          <KV rows={[
            ["Type", s.sellerType], ["Legal name", s.legalName], ["Trading name", s.businessName], ["ABN / ACN", [s.abn, s.acn].filter(Boolean).join(" / ") || "—"], ["Authorised rep", s.authorisedRep],
            ["Address", `${s.address} ${s.state ?? ""} ${s.postcode ?? ""}`], ["Applied", dateTime(s.createdAt)], ["Approved", dateTime(s.approvedAt)],
            ["Listings", listings], ["Approved sales", `${sales._count} · ${money(sales._sum.salePrice ?? 0)}`],
          ]} />
        </Section>
        <Section title="Account & verification">
          <KV rows={[
            ["User ID", <span key="i" className="font-mono">{u.publicId}</span>], ["Account", <Badge key="a" status={u.accountStatus} labels={ACCOUNT_STATUS} />],
            ["Email", `${u.email} ${u.emailVerifiedAt ? "✅" : "⬜"}`], ["Mobile", `${u.mobile} ${u.mobileVerifiedAt ? "✅" : "⬜"}`],
            ["Date of birth", u.dateOfBirth?.toISOString().slice(0, 10)], ["Risk flags", u.riskFlags ?? "None"],
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
      <Section title="Approval log">
        <ul className="space-y-1 text-sm">{history.map((h) => <li key={h.id}><span className="text-muted">{dateTime(h.createdAt)}</span> — {h.action.replace(/_/g, " ").toLowerCase()}{h.reason && <>: <i>{h.reason}</i></>}</li>)}</ul>
      </Section>
    </div>
  );
}

import { brand } from "@/config/brand";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Flash, KV, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SellerTypeFields } from "@/components/SellerTypeFields";
import { LocationFields } from "@/components/LocationFields";
import { VerificationChecklist } from "@/components/VerificationChecklist";
import { DOCUMENT_TYPES, SELLER_STATUS } from "@/lib/constants";
import { BUSINESS_STRUCTURES } from "@/lib/au-validation";
import { LOCATION_STATUS, BUSINESS_CHECK_STATUS } from "@/lib/seller-location";
import { oneLine, readStoredLocation, sellerChecklist, structureOf } from "@/lib/seller-verification";
import { submitVerificationAction, updateSellerBusinessAction, updateSellerLocationAction, uploadDocumentAction } from "@/app/actions/seller";

export const metadata = { title: "Seller verification" };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const p = user.sellerProfile ? await db.sellerProfile.findUnique({ where: { id: user.sellerProfile.id }, include: { documents: { orderBy: { createdAt: "desc" } } } }) : null;
  if (!p) return <PageHeader title="Verification" subtitle="Admins don't need seller verification." />;
  const editable = ["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED"].includes(p.status);
  const docsEditable = editable || p.status === "UNDER_REVIEW";
  const checklist = await sellerChecklist(user, p);
  const loc = readStoredLocation(p);
  const structure = structureOf(p);

  return (
    <div className="space-y-6">
      <PageHeader title="Seller verification" subtitle={<>Status <Badge status={p.status} labels={SELLER_STATUS} /></>} />
      <Flash sp={sp} />
      {p.statusReason && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><b>Message from {brand.name}:</b> {p.statusReason}</div>}

      <Section title="Verification checklist">
        <VerificationChecklist items={checklist} />
        {editable && (
          <form action={submitVerificationAction} className="mt-4"><SubmitButton>Submit for admin review</SubmitButton></form>
        )}
      </Section>

      <Section title="Business details">
        <KV rows={[
          ["Seller ID", <span key="i" className="font-mono">{p.sellerCode}</span>],
          ["Registration type", BUSINESS_STRUCTURES[structure].label],
          ["ABN / ACN check", <Badge key="b" status={p.businessCheckStatus} labels={BUSINESS_CHECK_STATUS} />],
          ["Email / mobile", `${user.email} · ${user.mobile ?? "—"}`],
        ]} />
        {editable ? (
          <details className="mt-4" open={p.businessCheckStatus !== "VERIFIED" && !!(p.abn || p.acn)}>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Edit business details</summary>
            <form action={updateSellerBusinessAction} className="mt-3 space-y-4">
              <SellerTypeFields showBio={false} defaults={{ businessStructure: structure, legalName: p.legalName, businessName: p.businessName, authorisedRep: p.authorisedRep, abn: p.abn, acn: p.acn, abnConfirmed: !!p.abnConfirmedAt }} />
              <SubmitButton className="btn-secondary">Save business details</SubmitButton>
            </form>
          </details>
        ) : (
          <KV rows={[[structure === "INDIVIDUAL" ? "Legal name" : "Legal entity name", p.legalName], ["ABN", p.abn ?? "—"], ["ACN", p.acn ?? "—"]]} />
        )}
      </Section>

      <Section title="Location verification">
        <KV rows={[
          ["Status", <Badge key="l" status={p.locationStatus} labels={LOCATION_STATUS} />],
          ["Residential address", oneLine(loc.residential) === "—" ? p.address : oneLine(loc.residential)],
          ...(loc.business ? ([["Business address", oneLine(loc.business)]] as [string, React.ReactNode][]) : []),
          ...(p.locationNotes ? ([["Notes", p.locationNotes]] as [string, React.ReactNode][]) : []),
        ]} />
        {editable ? (
          <details className="mt-4" open={p.locationStatus === "NOT_VERIFIED" || p.locationStatus === "FAILED"}>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">{loc.residential ? "Correct my address" : "Enter my address"}</summary>
            <form action={updateSellerLocationAction} className="mt-3 space-y-4">
              <LocationFields defaults={{ residential: loc.residential, business: loc.business, pin: loc.geo?.pin ?? null, pinConfirmed: !!p.pinConfirmedAt }} />
              <SubmitButton className="btn-secondary">Save address</SubmitButton>
            </form>
          </details>
        ) : <p className="mt-2 text-xs text-muted">To change your address after submitting, contact {brand.supportEmail}.</p>}
      </Section>

      <Section title="Verification documents">
        <p className="mb-4 text-sm text-muted">
          Required: photo ID (driver licence or passport), <b>proof of address</b> (utility bill, bank statement or government letter from the last 3 months){p.sellerType === "BUSINESS" ? ", and ABN/ASIC registration (plus an authority letter if you're not a director)" : ""}.
          Documents are stored privately and only visible to you and {brand.name} compliance staff. Bank details are verified by our payment provider, not stored here.
        </p>
        {p.documents.length > 0 && (
          <table className="table mb-4">
            <thead><tr><th>Document</th><th>File</th><th>Uploaded</th><th>Status</th></tr></thead>
            <tbody>{p.documents.map((d) => (
              <tr key={d.id}><td>{DOCUMENT_TYPES[d.documentType]}</td><td><a className="link" href={`/api/documents/${d.id}`} target="_blank">{d.fileName}</a></td><td>{dateTime(d.createdAt)}</td><td><Badge status={d.status} />{d.reviewNote && <div className="text-xs text-muted">{d.reviewNote}</div>}</td></tr>
            ))}</tbody>
          </table>
        )}
        {docsEditable && (
          <form action={uploadDocumentAction} className="flex flex-wrap items-end gap-3">
            <div><label className="label" htmlFor="documentType">Type</label>
              <select id="documentType" name="documentType" className="input">{Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            <div className="flex-1"><label className="label" htmlFor="file">File (PDF/JPG/PNG, max 10MB)</label><input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="input" required /></div>
            <SubmitButton className="btn-secondary">Upload</SubmitButton>
          </form>
        )}
      </Section>
    </div>
  );
}

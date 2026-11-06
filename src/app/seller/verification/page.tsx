import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Flash, KV, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DOCUMENT_TYPES, SELLER_STATUS } from "@/lib/constants";
import { submitVerificationAction, uploadDocumentAction } from "@/app/actions/seller";

export const metadata = { title: "Seller verification" };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const p = user.sellerProfile ? await db.sellerProfile.findUnique({ where: { id: user.sellerProfile.id }, include: { documents: { orderBy: { createdAt: "desc" } } } }) : null;
  if (!p) return <PageHeader title="Verification" subtitle="Admins don't need seller verification." />;
  const editable = ["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED", "UNDER_REVIEW"].includes(p.status);
  const canSubmit = ["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED"].includes(p.status);

  return (
    <div className="space-y-6">
      <PageHeader title="Seller verification" subtitle={<>Status <Badge status={p.status} labels={SELLER_STATUS} /></>} />
      <Flash sp={sp} />
      {p.statusReason && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><b>Message from SellEasy:</b> {p.statusReason}</div>}
      <Section title="Your details">
        <KV rows={[
          ["Seller ID", <span key="i" className="font-mono">{p.sellerCode}</span>],
          ["Seller type", p.sellerType === "BUSINESS" ? "Business" : "Individual"],
          [p.sellerType === "BUSINESS" ? "Legal business name" : "Legal name", p.legalName],
          ...(p.sellerType === "BUSINESS" ? ([["Trading name", p.businessName], ["ABN", p.abn], ["ACN", p.acn], ["Authorised representative", p.authorisedRep]] as [string, React.ReactNode][]) : []),
          ["Address", p.address],
          ["Email / mobile", `${user.email} · ${user.mobile}`],
          ["Email & mobile verified", user.accountStatus === "ACTIVE" ? "Yes" : "No — complete at /verify"],
        ]} />
      </Section>
      <Section title="Verification documents">
        <p className="mb-4 text-sm text-muted">
          Required: photo ID (driver licence or passport) and {p.sellerType === "BUSINESS" ? "ABN/ASIC registration (plus an authority letter if you're not a director)" : "proof of address"}. Documents are stored privately and only visible to you and SellEasy compliance staff.
          Bank details are verified by our payment provider, not stored here.
        </p>
        {p.documents.length > 0 && (
          <table className="table mb-4">
            <thead><tr><th>Document</th><th>File</th><th>Uploaded</th><th>Status</th></tr></thead>
            <tbody>{p.documents.map((d) => (
              <tr key={d.id}><td>{DOCUMENT_TYPES[d.documentType]}</td><td><a className="link" href={`/api/documents/${d.id}`} target="_blank">{d.fileName}</a></td><td>{dateTime(d.createdAt)}</td><td><Badge status={d.status} />{d.reviewNote && <div className="text-xs text-muted">{d.reviewNote}</div>}</td></tr>
            ))}</tbody>
          </table>
        )}
        {editable && (
          <form action={uploadDocumentAction} className="flex flex-wrap items-end gap-3">
            <div><label className="label" htmlFor="documentType">Type</label>
              <select id="documentType" name="documentType" className="input">{Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            <div className="flex-1"><label className="label" htmlFor="file">File (PDF/JPG/PNG, max 10MB)</label><input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="input" required /></div>
            <SubmitButton className="btn-secondary">Upload</SubmitButton>
          </form>
        )}
      </Section>
      {canSubmit && (
        <form action={submitVerificationAction}><SubmitButton>Submit for admin review</SubmitButton></form>
      )}
    </div>
  );
}

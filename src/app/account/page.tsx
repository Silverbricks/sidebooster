import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateProfileAction } from "@/app/actions/account";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash, KV, PageHeader, Section, Stat } from "@/components/ui";
import { ACCOUNT_STATUS, AU_STATES, SELLER_STATUS } from "@/lib/constants";
import { date } from "@/lib/format";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [orders, tickets, wins] = await Promise.all([
    db.order.count({ where: { buyerId: user.id } }),
    db.ticket.count({ where: { buyerId: user.id, status: "VALID" } }),
    db.drawResult.count({ where: { winnerUserId: user.id, status: "PUBLISHED" } }),
  ]);
  const check = (ok: unknown) => (ok ? <Badge status="ACTIVE">Verified</Badge> : <Badge status="PENDING">Pending</Badge>);

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi ${user.firstName}`} subtitle={<>Buyer ID <span className="font-mono font-semibold">{user.publicId}</span></>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={orders} />
        <Stat label="Active tickets" value={tickets} />
        <Stat label="Wins" value={wins} />
      </div>
      <Section title="Verification" actions={user.accountStatus !== "ACTIVE" ? <Link href="/verify" className="btn-primary btn-sm">Complete verification</Link> : undefined}>
        <KV rows={[
          ["Account status", <Badge key="s" status={user.accountStatus} labels={ACCOUNT_STATUS} />],
          ["Email", <span key="e">{user.email} {check(user.emailVerifiedAt)}</span>],
          ["Mobile", <span key="m">{user.mobile} {check(user.mobileVerifiedAt)}</span>],
          ["Identity", user.idVerifiedAt ? <Badge key="i" status="ACTIVE">Verified</Badge> : <span key="i" className="text-muted">Not required yet (risk-based)</span>],
          ["Terms accepted", date(user.termsAcceptedAt)],
          ...(user.sellerProfile ? [["Seller account", <span key="sp"><span className="font-mono">{user.sellerProfile.sellerCode}</span> <Badge status={user.sellerProfile.status} labels={SELLER_STATUS} /></span>] as [string, React.ReactNode]] : []),
        ]} />
      </Section>
      <Section title="Profile">
        <form action={updateProfileAction} className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Name</label><input className="input bg-slate-50" value={user.name} readOnly /></div>
          <div><label className="label" htmlFor="displayName">Public display name (if you win)</label><input id="displayName" name="displayName" defaultValue={user.displayName ?? ""} className="input" placeholder={`${user.firstName} ${user.lastName[0]}.`} /></div>
          <div><label className="label" htmlFor="dateOfBirth">Date of birth</label>
            {user.dateOfBirth ? <input className="input bg-slate-50" value={date(user.dateOfBirth)} readOnly /> : <input id="dateOfBirth" name="dateOfBirth" type="date" className="input" />}
            <p className="hint">Required for promotions. Contact support to correct it once set.</p>
          </div>
          <div><label className="label" htmlFor="state">State</label>
            <select id="state" name="state" defaultValue={user.state ?? ""} className="input"><option value="">—</option>{AU_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          </div>
          <div><label className="label" htmlFor="suburb">Suburb</label><input id="suburb" name="suburb" defaultValue={user.suburb ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="postcode">Postcode</label><input id="postcode" name="postcode" defaultValue={user.postcode ?? ""} className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
        </form>
      </Section>
    </div>
  );
}

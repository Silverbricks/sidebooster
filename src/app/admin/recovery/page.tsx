import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { Badge, Empty, Flash, KV, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ACCOUNT_STATUS } from "@/lib/constants";
import { adminRecoveryAction, decideRecoveryAction } from "@/app/actions/admin-recovery";
import { describeDevice, lockedFor } from "@/lib/login-security";
import { maskMobile, normaliseUsername } from "@/lib/auth-codes";

export const metadata = { title: "Account recovery" };
export const dynamic = "force-dynamic";

const RECOVERY_ACTIONS = [
  "PASSWORD_RESET", "PASSWORD_CHANGED", "USERNAME_RECOVERED", "USERNAME_CHANGED", "ADMIN_CHANGED_USERNAME", "EMAIL_HINT_SHOWN", "RECOVERY_REQUESTED",
  "EMAIL_CHANGED", "EMAIL_CHANGED_BY_ADMIN", "EMAIL_CHANGED_BY_RECOVERY", "ADMIN_STARTED_EMAIL_CHANGE", "ADMIN_SENT_RESET_LINK", "ADMIN_UNLOCKED_ACCOUNT",
  "ADMIN_REVOKED_SESSIONS", "SESSIONS_REVOKED", "SESSION_REVOKED",
];

export default async function AdminRecoveryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const selfPath = `/admin/recovery?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.user ? { user: sp.user } : {}) })}`;

  const results = q
    ? await db.user.findMany({
        where: {
          OR: [
            { email: { contains: q, mode: "insensitive" } }, { username: normaliseUsername(q) }, { publicId: q.toUpperCase() }, { id: q },
            { mobile: { contains: q.replace(/[^\d+]/g, "").replace(/^0/, "+61") || "__none__" } }, { name: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 20, orderBy: { createdAt: "desc" },
      })
    : [];
  const pending = await db.recoveryRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { publicId: true, name: true, email: true } } } });

  const u = sp.user ? await db.user.findUnique({ where: { id: sp.user } }) : null;
  const [logins, failed30, sessions, history, requests] = u
    ? await Promise.all([
        db.loginEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 25 }),
        db.loginEvent.count({ where: { userId: u.id, success: false, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
        db.session.findMany({ where: { userId: u.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
        db.auditLog.findMany({ where: { entityType: "User", entityId: u.id, action: { in: RECOVERY_ACTIONS } }, orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { publicId: true } } } }),
        db.recoveryRequest.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" } }),
      ])
    : [[], 0, [], [], []];

  const hidden = (op: string) => (<><input type="hidden" name="op" value={op} /><input type="hidden" name="userId" value={u?.id ?? ""} /><input type="hidden" name="back" value={selfPath} /></>);

  return (
    <div className="space-y-6">
      <PageHeader title="Account recovery" subtitle="Find an account, help someone back in, and review lost-email requests. Passwords are never visible." />
      <Flash sp={sp} />

      <Section title={`Lost-email requests awaiting review (${pending.length})`}>
        {pending.length === 0 ? <p className="text-sm text-muted">No pending requests.</p> : (
          <ul className="space-y-4">
            {pending.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold"><span className="font-mono">{r.reference}</span> · {r.kind === "IDENTITY" ? "Identity review (lost email and mobile)" : "Mobile verified"}</div>
                  <span className="text-xs text-muted">{dateTime(r.createdAt)} · IP {r.ip ?? "—"}</span>
                </div>
                <KV rows={[
                  ["Account", r.user ? <Link key="a" href={`/admin/recovery?user=${r.userId}`} className="link">{r.user.publicId} · {r.user.name} · {r.user.email}</Link> : <span key="a" className="text-amber-700">No matching account for “{r.identifier}”. Link one below if the evidence supports it.</span>],
                  ["Name given", r.fullName ?? "—"],
                  ["New email (verified)", r.newEmail],
                  ["Checks passed", [r.mobileVerified && "registered mobile code", r.newEmailVerified && "new email code"].filter(Boolean).join(" + ") || "—"],
                  ["Evidence offered", <span key="d" className="whitespace-pre-wrap">{r.details || "—"}</span>],
                ]} />
                <form action={decideRecoveryAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="back" value={selfPath} />
                  <div className="space-y-2">
                    {!r.userId && <input name="accountId" className="input" placeholder="Link to account ID or username" aria-label="Account ID or username" />}
                    <input name="note" className="input" required placeholder="What you verified, or why you're rejecting (required)" aria-label="Decision note" />
                  </div>
                  <SubmitButton name="decision" value="APPROVE" className="btn-primary" confirm="Change this account's email to the verified new address and sign it out everywhere?">Approve</SubmitButton>
                  <SubmitButton name="decision" value="REJECT" className="btn-secondary">Reject</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Approve only when you have evidence that only the real owner would have. Never approve based on username, date of birth or other public details alone. The current email/mobile on file was already told about each request.</p>
      </Section>

      <Section title="Find an account">
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={q} className="input max-w-md" placeholder="Email, username, mobile, account ID or name" aria-label="Search accounts" />
          <button className="btn-primary" type="submit">Search</button>
        </form>
        {q && (results.length === 0 ? <p className="mt-3 text-sm text-muted">No accounts match “{q}”.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Account</th><th>Email</th><th>Username</th><th>Mobile</th><th>Status</th><th></th></tr></thead>
              <tbody>{results.map((r) => (
                <tr key={r.id}>
                  <td><span className="font-mono">{r.publicId}</span><div className="text-xs text-muted">{r.name} · {r.role.toLowerCase()}</div></td>
                  <td>{r.email}</td><td className="font-mono">{r.username ?? "—"}</td><td>{maskMobile(r.mobile)}</td>
                  <td><Badge status={r.accountStatus} labels={ACCOUNT_STATUS} />{lockedFor(r) > 0 && <span className="ml-1 text-xs text-red-700">locked</span>}</td>
                  <td><Link href={`/admin/recovery?${new URLSearchParams({ q, user: r.id })}`} className="link">Manage →</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </Section>

      {sp.user && !u && <Empty>That account no longer exists.</Empty>}
      {u && (
        <>
          <Section title={`${u.name} · ${u.publicId}`}>
            <div className="grid gap-6 lg:grid-cols-2">
              <KV rows={[
                ["Status", <Badge key="s" status={u.accountStatus} labels={ACCOUNT_STATUS} />],
                ["Sign-in lock", lockedFor(u) ? <span key="l" className="text-red-700">Locked for {lockedFor(u)} more min ({u.failedLogins} failed attempts)</span> : `Not locked (${u.failedLogins} consecutive failures)`],
                ["Registered email", <span key="e">{u.email} {u.emailVerifiedAt ? <Badge status="ACTIVE">Verified</Badge> : <Badge status="PENDING">Unverified</Badge>}</span>],
                ["Username", u.username ?? "—"],
                ["Mobile", maskMobile(u.mobile)],
                ["Password", u.passwordChangedAt ? `Last changed ${dateTime(u.passwordChangedAt)} (never visible)` : "Never visible to staff"],
                ["Failed sign-ins (30 days)", String(failed30)],
                ["Active sessions", String(sessions.length)],
              ]} />
              <div className="space-y-4 text-sm">
                <form action={adminRecoveryAction}>{hidden("reset-link")}<SubmitButton className="btn-primary" confirm="Email a single-use password reset link to the registered address?">Send password reset link</SubmitButton>
                  <p className="hint">Emails a single-use link to {u.email} (expires in 30 minutes). You never see or set the password.</p></form>
                <form action={adminRecoveryAction} className="flex flex-wrap gap-2">{hidden("unlock")}<input name="reason" className="input flex-1" required placeholder="Reason for unlocking" aria-label="Reason for unlocking" /><SubmitButton className="btn-secondary">Unlock</SubmitButton></form>
                <form action={adminRecoveryAction} className="flex flex-wrap gap-2">{hidden("revoke")}<input name="reason" className="input flex-1" required placeholder="Reason for signing out all devices" aria-label="Reason for revoking sessions" /><SubmitButton className="btn-secondary">Sign out everywhere</SubmitButton></form>
                <form action={adminRecoveryAction} className="grid gap-2 sm:grid-cols-2">{hidden("username")}<input name="username" className="input font-mono" defaultValue={u.username ?? ""} placeholder="New username (blank removes)" aria-label="New username" /><input name="reason" className="input" required placeholder="Reason" aria-label="Reason for username change" /><SubmitButton className="btn-secondary sm:col-span-2">Change username</SubmitButton></form>
                <form action={adminRecoveryAction} className="grid gap-2 sm:grid-cols-2">{hidden("email")}<input name="newEmail" type="email" className="input" required placeholder="New email address" aria-label="New email address" /><input name="reason" className="input" required placeholder="Reason / evidence checked" aria-label="Reason for email change" /><SubmitButton className="btn-secondary sm:col-span-2" confirm="Send a confirmation link to the new address? The change applies only when it's confirmed.">Change email (sends confirmation)</SubmitButton></form>
              </div>
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Login history (last 25)">
              {logins.length === 0 ? <p className="text-sm text-muted">No sign-ins recorded.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {logins.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3 py-1.5">
                      <span>{l.success ? "✔" : "✘"} {l.method === "EMAIL_CODE" ? "Email code" : l.method === "RESET" ? "Password reset" : "Password"}{!l.success && l.reason ? ` · ${l.reason.toLowerCase().replace("_", " ")}` : ""}{l.newDevice ? " · new device" : ""}<span className="block text-xs text-muted">{describeDevice(l.userAgent)} · IP {l.ip ?? "—"}</span></span>
                      <span className="shrink-0 text-xs text-muted">{dateTime(l.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Recovery & account-change history">
              {history.length === 0 && requests.length === 0 ? <p className="text-sm text-muted">Nothing recorded.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {requests.map((r) => <li key={r.id} className="py-1.5"><span className="font-mono">{r.reference}</span> · {r.kind.toLowerCase().replace("_", " ")} · <Badge status={r.status === "APPROVED" ? "ACTIVE" : r.status === "REJECTED" ? "REJECTED" : "PENDING"}>{r.status.toLowerCase()}</Badge><span className="block text-xs text-muted">{dateTime(r.createdAt)}{r.decisionNote ? ` · ${r.decisionNote}` : ""}</span></li>)}
                  {history.map((h) => <li key={h.id} className="py-1.5">{h.action.replaceAll("_", " ").toLowerCase()}<span className="block text-xs text-muted">{h.actor?.publicId ?? "system"} · {dateTime(h.createdAt)}{h.reason ? ` · ${h.reason}` : ""}</span></li>)}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted">Full trail in the <Link href={`/admin/audit?entity=User`} className="link">audit log</Link>, which can&apos;t be edited or deleted.</p>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

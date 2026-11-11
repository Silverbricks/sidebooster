import { requireUser, currentSessionId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFlow, describeDevice } from "@/lib/login-security";
import { dateTime } from "@/lib/format";
import { Badge, Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import {
  cancelEmailChangeAction, changePasswordAction, confirmEmailChangeAction, revokeOtherSessionsAction, revokeSessionAction, setUsernameAction, startEmailChangeAction,
} from "@/app/actions/security";

export const metadata = { title: "Security & sign-in" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = { BAD_PASSWORD: "Wrong password", BAD_CODE: "Wrong code", LOCKED: "Account locked", BLOCKED: "Account suspended", UNKNOWN: "Unknown account", PASSWORD_RESET: "Password reset" };
const METHOD: Record<string, string> = { PASSWORD: "Password", EMAIL_CODE: "Email code", RESET: "Password reset" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser(undefined, "/account/security");
  const sp = await searchParams;
  const [sessions, history, thisSession, changeFlow] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    db.loginEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    currentSessionId(),
    getFlow("EMAIL_CHANGE"),
  ]);
  const changing = sp.change === "verify" && !!changeFlow;

  return (
    <div className="space-y-6">
      <PageHeader title="Security & sign-in" subtitle="Manage how you sign in and which devices are signed in." />
      <Flash sp={sp} />

      <Section title="Sign-in details">
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={setUsernameAction} className="space-y-3">
            <div>
              <label className="label" htmlFor="username">Username</label>
              <input id="username" name="username" className="input font-mono" defaultValue={user.username ?? ""} placeholder="e.g. sam.sells" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} />
              <p className="hint">Optional. Sign in with your username or email. 3–30 characters: letters, numbers, dots, dashes, underscores. Leave blank to remove.</p>
            </div>
            <SubmitButton className="btn-secondary">Save username</SubmitButton>
          </form>
          <div className="space-y-1 text-sm">
            <div className="label">Email</div>
            <div className="font-medium">{user.email}</div>
            <div className="text-muted">Account ID <span className="font-mono">{user.publicId}</span>{user.passwordChangedAt && <> · password last changed {dateTime(user.passwordChangedAt)}</>}</div>
          </div>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Change password">
          <form action={changePasswordAction} className="space-y-3">
            <div><label className="label" htmlFor="currentPassword">Current password</label><PasswordInput id="currentPassword" name="currentPassword" /></div>
            <div><label className="label" htmlFor="password">New password</label><PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} describedBy="np-hint" /><p id="np-hint" className="hint">10+ characters, upper &amp; lower case and a number.</p></div>
            <div><label className="label" htmlFor="confirmPassword">Confirm new password</label><PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" /></div>
            <SubmitButton>Change password</SubmitButton>
            <p className="text-xs text-muted">Your other devices will be signed out.</p>
          </form>
        </Section>

        <Section title="Change email address">
          {changing ? (
            <div className="space-y-3">
              <form action={confirmEmailChangeAction} className="space-y-3">
                <p className="text-sm">Enter both codes. One went to your current address, the other to your new address.</p>
                <div><label className="label" htmlFor="codeOld">Code sent to {user.email}</label><input id="codeOld" name="codeOld" className="input font-mono tracking-widest" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" /></div>
                <div><label className="label" htmlFor="codeNew">Code sent to your new address</label><input id="codeNew" name="codeNew" className="input font-mono tracking-widest" inputMode="numeric" pattern="\d{6}" maxLength={6} required /></div>
                <SubmitButton>Confirm email change</SubmitButton>
              </form>
              <form action={cancelEmailChangeAction}><button className="link text-sm" type="submit">Cancel</button></form>
            </div>
          ) : (
            <form action={startEmailChangeAction} className="space-y-3">
              <div><label className="label" htmlFor="newEmail">New email address</label><input id="newEmail" name="newEmail" type="email" className="input" required autoComplete="email" /></div>
              <div><label className="label" htmlFor="ecPassword">Current password</label><PasswordInput id="ecPassword" name="currentPassword" /></div>
              <SubmitButton>Send confirmation codes</SubmitButton>
              <p className="text-xs text-muted">For your safety we confirm the change with both your current and your new address.</p>
            </form>
          )}
        </Section>
      </div>

      <Section title={`Signed-in devices (${sessions.length})`} actions={sessions.length > 1 ? <form action={revokeOtherSessionsAction}><SubmitButton className="btn-secondary btn-sm" confirm="Sign out of all other devices?">Sign out all other devices</SubmitButton></form> : undefined}>
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <div>
                <div className="font-medium">{describeDevice(s.userAgent)} {s.id === thisSession && <Badge status="ACTIVE">This device</Badge>}</div>
                <div className="text-xs text-muted">Signed in {dateTime(s.createdAt)} with {METHOD[s.method] ?? s.method} · last active {dateTime(s.lastSeenAt)} · IP {s.ip ?? "unknown"}{s.persistent ? " · remembered" : ""}</div>
              </div>
              {s.id !== thisSession && (
                <form action={revokeSessionAction}><input type="hidden" name="sessionId" value={s.id} /><SubmitButton className="btn-secondary btn-sm">Sign out</SubmitButton></form>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Recent sign-in activity">
        {history.length === 0 ? <p className="text-sm text-muted">No sign-in activity recorded yet.</p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Result</th><th>Method</th><th>Device</th><th>IP address</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap">{dateTime(h.createdAt)}</td>
                    <td>{h.success ? <Badge status="ACTIVE">{h.reason === "PASSWORD_RESET" ? "Password reset" : "Signed in"}</Badge> : <Badge status="REJECTED">{REASONS[h.reason ?? ""] ?? "Failed"}</Badge>}{h.newDevice && <span className="ml-1 text-xs text-amber-700">new device</span>}</td>
                    <td>{METHOD[h.method] ?? h.method}</td>
                    <td>{describeDevice(h.userAgent)}</td>
                    <td className="font-mono text-xs">{h.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Don&apos;t recognise something? Change your password and sign out of all other devices.</p>
      </Section>
    </div>
  );
}

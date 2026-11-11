// Shared frame + code-entry form for sign-in and recovery pages.
import Link from "next/link";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ResendButton } from "@/components/ResendButton";
import { resendCodeAction, startOverAction } from "@/app/actions/recovery";

export function AuthCard({ title, subtitle, sp, children, footer }: {
  title: string; subtitle?: React.ReactNode; sp: Record<string, string>; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="container-page max-w-md py-10 sm:py-14">
      <h1 className="h1 text-balance">{title}</h1>
      {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      <div className="mt-6"><Flash sp={sp} /></div>
      <div className="card card-pad space-y-4">{children}</div>
      {footer && <div className="mt-5 space-y-2 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

/** 6-digit code input + submit, with resend (60s cooldown) and start-over controls. */
export function CodeStep({ action, flow, step = "verify", sentTo, hidden = {}, keep = {}, justSent, extra, submitLabel = "Continue" }: {
  action: (fd: FormData) => Promise<void>; flow: string; step?: string; sentTo: string; hidden?: Record<string, string>; keep?: Record<string, string>;
  justSent: boolean; extra?: React.ReactNode; submitLabel?: string;
}) {
  return (
    <>
      <form action={action} className="space-y-4">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div>
          <label className="label" htmlFor="code">6-digit code</label>
          <input
            id="code" name="code" className="input text-center font-mono text-2xl tracking-[0.5em]" required inputMode="numeric" pattern="\d{6}" maxLength={6}
            autoComplete="one-time-code" autoFocus aria-describedby="code-hint"
          />
          <p id="code-hint" className="hint">Sent to {sentTo}. It expires in 10 minutes. Check your spam folder if it hasn&apos;t arrived.</p>
        </div>
        {extra}
        <SubmitButton className="btn-primary w-full">{submitLabel}</SubmitButton>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <form action={resendCodeAction}>
          <input type="hidden" name="flow" value={flow} /><input type="hidden" name="step" value={step} />
          {Object.entries(keep).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <ResendButton initialSeconds={justSent ? 60 : 0} />
        </form>
        <form action={startOverAction}>
          <input type="hidden" name="flow" value={flow} />
          <button type="submit" className="link">Start again</button>
        </form>
      </div>
    </>
  );
}

export const AuthLinks = () => (
  <p>
    <Link href="/forgot-password" className="link">Forgot password?</Link> · <Link href="/forgot-username" className="link">Forgot username?</Link> · <Link href="/forgot-email" className="link">Forgot registered email?</Link>
  </p>
);

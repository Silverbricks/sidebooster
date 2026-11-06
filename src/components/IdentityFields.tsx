import Link from "next/link";
import { AU_STATES } from "@/lib/constants";
import { Field } from "./ui";

export function IdentityFields({ dobRequired }: { dobRequired?: boolean }) {
  return (
    <>
      {/* honeypot: bots fill this, humans never see it */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" required><input id="firstName" name="firstName" className="input" required autoComplete="given-name" /></Field>
        <Field label="Last name" name="lastName" required><input id="lastName" name="lastName" className="input" required autoComplete="family-name" /></Field>
        <Field label="Email address" name="email" required><input id="email" name="email" type="email" className="input" required autoComplete="email" /></Field>
        <Field label="Mobile number" name="mobile" required hint="We'll send a one-time code to verify it.">
          <input id="mobile" name="mobile" type="tel" className="input" placeholder="04xx xxx xxx" required autoComplete="tel" />
        </Field>
        <Field label="Password" name="password" required hint="10+ characters, upper & lower case and a number.">
          <input id="password" name="password" type="password" className="input" required minLength={10} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" name="confirmPassword" required>
          <input id="confirmPassword" name="confirmPassword" type="password" className="input" required autoComplete="new-password" />
        </Field>
        <Field label="Country" name="country"><input id="country" className="input bg-slate-50" value="Australia" readOnly /></Field>
        <Field label="State / territory" name="state" required>
          <select id="state" name="state" className="input" required defaultValue="">
            <option value="" disabled>Select…</option>
            {AU_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Postcode" name="postcode" required><input id="postcode" name="postcode" className="input" inputMode="numeric" pattern="\d{4}" required autoComplete="postal-code" /></Field>
        <Field label="Date of birth" name="dateOfBirth" required={dobRequired} hint={dobRequired ? undefined : "Needed to enter promotions (18+)."}>
          <input id="dateOfBirth" name="dateOfBirth" type="date" className="input" required={dobRequired} autoComplete="bday" />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="terms" className="mt-1" required />
        <span>I accept the <Link href="/terms" className="link" target="_blank">Terms &amp; Conditions</Link> and <Link href="/privacy" className="link" target="_blank">Privacy Policy</Link>.</span>
      </label>
    </>
  );
}

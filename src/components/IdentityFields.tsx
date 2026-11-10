import { AU_STATES } from "@/lib/constants";
import { ConsentFields } from "./ConsentFields";
import { Field } from "./ui";

/**
 * Account identity fields shared by buyer and seller registration.
 * `seller`: location comes from the Seller Location Verification module instead of the short state/postcode fields.
 */
export function IdentityFields({ dobRequired, seller }: { dobRequired?: boolean; seller?: boolean }) {
  return (
    <>
      {/* honeypot: bots fill this, humans never see it */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" required><input id="firstName" name="firstName" className="input" required autoComplete="given-name" /></Field>
        <Field label="Last name" name="lastName" required><input id="lastName" name="lastName" className="input" required autoComplete="family-name" /></Field>
        <Field label="Email address" name="email" required><input id="email" name="email" type="email" className="input" required autoComplete="email" /></Field>
        <Field label="Mobile number" name="mobile" required hint="Australian mobile, e.g. 0412 345 678. We'll send a one-time SMS code.">
          <div className="flex">
            <span className="inline-flex items-center rounded-l-lg border border-r-0 border-line bg-slate-50 px-3 text-sm text-muted" title="Australia">🇦🇺 +61</span>
            <input id="mobile" name="mobile" type="tel" className="input rounded-l-none" placeholder="4XX XXX XXX or 04XX XXX XXX" required autoComplete="tel-national" inputMode="tel" />
          </div>
        </Field>
        <Field label="Password" name="password" required hint="10+ characters, upper & lower case and a number.">
          <input id="password" name="password" type="password" className="input" required minLength={10} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" name="confirmPassword" required>
          <input id="confirmPassword" name="confirmPassword" type="password" className="input" required autoComplete="new-password" />
        </Field>
        {!seller && (
          <>
            <Field label="Country" name="country"><input id="country" className="input bg-slate-50" value="Australia" readOnly /></Field>
            <Field label="State / territory" name="state" required>
              <select id="state" name="state" className="input" required defaultValue="">
                <option value="" disabled>Select…</option>
                {AU_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Postcode" name="postcode" required><input id="postcode" name="postcode" className="input" inputMode="numeric" pattern="\d{4}" required autoComplete="postal-code" /></Field>
          </>
        )}
        <Field label="Date of birth" name="dateOfBirth" required={dobRequired} hint={dobRequired ? "DD/MM/YYYY — sellers must be 18 or older." : "DD/MM/YYYY — needed to enter promotions (18+)."}>
          <input id="dateOfBirth" name="dateOfBirth" className="input" placeholder="DD/MM/YYYY" required={dobRequired} pattern="\d{1,2}/\d{1,2}/\d{4}" inputMode="numeric" autoComplete="bday" maxLength={10} />
        </Field>
      </div>
      <ConsentFields />
    </>
  );
}

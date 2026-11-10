import Link from "next/link";
import { redirect } from "next/navigation";
import { registerSellerAction } from "@/app/actions/auth";
import { IdentityFields } from "@/components/IdentityFields";
import { SellerTypeFields } from "@/components/SellerTypeFields";
import { LocationFields } from "@/components/LocationFields";
import { ConsentFields } from "@/components/ConsentFields";
import { SubmitButton } from "@/components/SubmitButton";
import { Field, Flash } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Seller registration" };

const STEPS = [
  "Register & get your Seller ID",
  "Verify your mobile (SMS code) and email",
  "ABN / ACN checked on the Australian Business Register",
  "Location verified (address, map pin, proof of address)",
  "Identity & age (18+) — photo ID",
  "Terms & Privacy accepted",
  "Admin review → approved",
  "Connect payout account, then list products",
];

export default async function SellerRegisterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await getCurrentUser();
  if (user?.sellerProfile) redirect("/seller");
  const sp = await searchParams;
  return (
    <div className="container-page grid gap-8 py-10 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="h1">Become a verified seller</h1>
        <p className="mt-1 text-sm text-muted">
          {user ? <>You&apos;re upgrading <b>{user.publicId}</b>. You keep your Buyer ID and receive a separate Seller ID.</> : <>Already have a buyer account? <Link href="/login?next=/register/seller" className="link">Log in first</Link> to upgrade it.</>}
        </p>
        <div className="mt-6"><Flash sp={sp} /></div>
        <form action={registerSellerAction} className="card card-pad space-y-8">
          <section className="space-y-4">
            <h2 className="h2">1. Business details</h2>
            <SellerTypeFields />
          </section>
          <hr className="border-line" />
          <section className="space-y-4">
            <h2 className="h2">2. Location</h2>
            <LocationFields />
          </section>
          <hr className="border-line" />
          <section className="space-y-4">
            <h2 className="h2">3. {user ? "Confirm & accept" : "Your account"}</h2>
            {user ? (
              <>
                {!user.dateOfBirth && (
                  <div className="max-w-xs">
                    <Field label="Date of birth" name="dateOfBirth" required hint="DD/MM/YYYY — sellers must be 18 or older.">
                      <input id="dateOfBirth" name="dateOfBirth" className="input" placeholder="DD/MM/YYYY" required pattern="\d{1,2}/\d{1,2}/\d{4}" inputMode="numeric" maxLength={10} />
                    </Field>
                  </div>
                )}
                <ConsentFields />
              </>
            ) : (
              <IdentityFields dobRequired seller />
            )}
          </section>
          <SubmitButton>Register as seller</SubmitButton>
        </form>
      </div>
      <aside className="card card-pad h-fit">
        <h2 className="h2 mb-3">How seller approval works</h2>
        <ol className="space-y-3 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">No verification = no selling. Your registration is saved as a draft — you can finish the remaining steps from your seller dashboard.</p>
        <p className="mt-3 text-xs text-muted">Your date of birth, mobile, street address and documents are private and never shown publicly.</p>
      </aside>
    </div>
  );
}

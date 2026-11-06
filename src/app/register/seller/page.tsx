import Link from "next/link";
import { redirect } from "next/navigation";
import { registerSellerAction } from "@/app/actions/auth";
import { IdentityFields } from "@/components/IdentityFields";
import { SellerTypeFields } from "@/components/SellerTypeFields";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Seller registration" };

const STEPS = ["Register & get your Seller ID", "Verify email and mobile", "Upload identity / business documents", "Admin verification", "Connect payout account", "Create listings (each listing is reviewed)"];

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
        <form action={registerSellerAction} className="card card-pad space-y-6">
          <SellerTypeFields />
          {!user && (
            <>
              <hr className="border-line" />
              <h2 className="h2">Your account</h2>
              <IdentityFields dobRequired />
            </>
          )}
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
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">No verification = no selling. You can prepare draft listings while your account is reviewed.</p>
      </aside>
    </div>
  );
}

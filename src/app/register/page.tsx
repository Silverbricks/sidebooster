import Link from "next/link";
import { redirect } from "next/navigation";
import { registerBuyerAction } from "@/app/actions/auth";
import { IdentityFields } from "@/components/IdentityFields";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Buyer registration" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (await getCurrentUser()) redirect("/account");
  const sp = await searchParams;
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="h1">Create your buyer account</h1>
      <p className="mt-1 text-sm text-muted">
        You&apos;ll get a permanent Buyer ID. Selling? <Link href="/register/seller" className="link">Register as a seller</Link>.
      </p>
      <div className="mt-6"><Flash sp={sp} /></div>
      <form action={registerBuyerAction} className="card card-pad space-y-5">
        <IdentityFields />
        <SubmitButton>Create account</SubmitButton>
        <p className="text-sm text-muted">Already registered? <Link href="/login" className="link">Log in</Link></p>
      </form>
    </div>
  );
}

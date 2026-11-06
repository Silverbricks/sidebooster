import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/ui";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="h1">Log in</h1>
      <div className="mt-6"><Flash sp={sp} /></div>
      <form action={loginAction} className="card card-pad space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required autoComplete="email" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" className="input" required autoComplete="current-password" /></div>
        <SubmitButton className="btn-primary w-full">Log in</SubmitButton>
        <p className="text-center text-sm text-muted">New here? <Link href="/register" className="link">Create a buyer account</Link> · <Link href="/register/seller" className="link">Sell</Link></p>
      </form>
    </div>
  );
}

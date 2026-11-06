import Link from "next/link";
import { verifyEmailToken } from "@/app/actions/auth";

export const metadata = { title: "Email verification" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmailToken(token) : false;
  return (
    <div className="container-page max-w-md py-16 text-center">
      <h1 className="h1">{ok ? "Email verified ✓" : "Link invalid or expired"}</h1>
      <p className="mt-2 text-sm text-muted">{ok ? "Thanks — your email address is confirmed." : "Log in and request a new verification link."}</p>
      <Link href="/verify" className="btn-primary mt-6">Continue</Link>
    </div>
  );
}

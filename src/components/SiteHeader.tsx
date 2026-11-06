import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logoutAction } from "@/app/actions/auth";

const NAV = [
  ["Marketplace", "/marketplace"],
  ["Cars", "/marketplace/cars-vehicles"],
  ["Property", "/marketplace/property-real-estate"],
  ["Mobiles", "/marketplace/mobile-phones"],
  ["Electronics", "/marketplace/electronics"],
  ["Other", "/marketplace/other-products"],
  ["Tickets & Draws", "/draws"],
  ["Results", "/results"],
] as const;

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null } }) : 0;
  const dash = user?.role === "ADMIN" ? "/admin" : user?.role === "SELLER" ? "/seller" : "/account";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">S</span>
          SellEasy
        </Link>
        <form action="/marketplace" className="hidden flex-1 md:block">
          <input name="q" placeholder="Search cars, phones, property…" className="input max-w-md" aria-label="Search listings" />
        </form>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/account/notifications" className="btn-secondary btn-sm relative" aria-label={`Notifications (${unread} unread)`}>
                🔔{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{unread}</span>}
              </Link>
              <Link href={dash} className="btn-secondary btn-sm">
                <span className="hidden sm:inline">{user.firstName}</span>
                <span className="font-mono text-[11px] text-muted">{user.publicId}</span>
              </Link>
              <form action={logoutAction}>
                <button className="btn-sm btn text-muted hover:text-ink">Log out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary btn-sm">Log in</Link>
              <Link href="/register" className="btn-primary btn-sm">Register</Link>
            </>
          )}
        </div>
      </div>
      <nav className="container-page flex gap-1 overflow-x-auto pb-2 text-sm" aria-label="Main">
        {NAV.map(([label, href]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-ink">
            {label}
          </Link>
        ))}
        {(!user || user.role === "BUYER") && (
          <Link href="/register/seller" className="ml-auto whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-brand-600 hover:bg-brand-50">
            Start selling
          </Link>
        )}
      </nav>
    </header>
  );
}

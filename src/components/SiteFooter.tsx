import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/branding/Logo";

const COLS: [string, [string, string][]][] = [
  ["Marketplace", [["All listings", "/marketplace"], ["Cars & Vehicles", "/marketplace/cars-vehicles"], ["Property", "/marketplace/property-real-estate"], ["Mobiles", "/marketplace/mobile-phones"], ["Electronics", "/marketplace/electronics"]]],
  ["Promotions", [["Tickets & Draws", "/draws"], ["Upcoming draws", "/draws?tab=upcoming"], ["Previous draws", "/draws?tab=previous"], ["Draw results", "/results"]]],
  ["Account", [["Buyer registration", "/register"], ["Seller registration", "/register/seller"], ["Log in", "/login"]]],
  ["Company", [["About us", "/about"], ["Contact us", "/contact"], ["Terms & Conditions", "/terms"], ["Privacy Policy", "/privacy"], ["Refund Policy", "/refund-policy"], ["Responsible Participation", "/responsible-participation"]]],
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="container-page flex flex-col gap-1 pt-10 text-sm">
        <Logo showTagline />
        <p className="mt-2 max-w-md text-muted">{brand.description}</p>
      </div>
      <div className="container-page grid grid-cols-2 gap-8 py-10 text-sm md:grid-cols-4">
        {COLS.map(([title, links]) => (
          <div key={title}>
            <div className="mb-3 font-semibold">{title}</div>
            <ul className="space-y-2 text-muted">
              {links.map(([l, h]) => (
                <li key={h}><Link href={h} className="hover:text-ink">{l}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} {brand.legalName} · {brand.domain}. Promotions are subject to their published terms and applicable Australian laws. 18+ only.
      </div>
    </footer>
  );
}

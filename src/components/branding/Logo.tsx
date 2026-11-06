import Link from "next/link";
import { brand } from "@/config/brand";
import { BrandIcon } from "./Favicon";
import { BrandName } from "./BrandName";

/** Full SideBooster logo: icon + wordmark, optionally with the tagline. Links home by default. */
export function Logo({ href = "/", showTagline = false, size = 32 }: { href?: string | null; showTagline?: boolean; size?: number }) {
  const content = (
    <span className="flex items-center gap-2">
      <BrandIcon size={size} />
      <span className="flex flex-col leading-none">
        <BrandName className="text-lg font-extrabold tracking-tight" />
        {showTagline && <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{brand.tagline}</span>}
      </span>
    </span>
  );
  if (href === null) return content;
  return (
    <Link href={href} aria-label={`${brand.name} home`} className="shrink-0">
      {content}
    </Link>
  );
}

export default Logo;

import { brand } from "@/config/brand";

/**
 * The SideBooster brand icon (rounded square with an upward "boost" chevron and a ticket notch).
 * The same artwork is used for the browser favicon (src/app/icon.svg, favicon.ico) and assets/icons/.
 */
export function BrandIcon({ size = 32, className }: { size?: number; className?: string }) {
  const id = `sb-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label={`${brand.name} icon`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={brand.colors.primaryLight} />
          <stop offset="1" stopColor={brand.colors.primary} />
        </linearGradient>
        <mask id={`${id}-m`}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="0" cy="32" r="6" fill="#000" />
          <circle cx="64" cy="32" r="6" fill="#000" />
        </mask>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} mask={`url(#${id}-m)`} />
      <path d="M18 34 L32 20 L46 34" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 46 L32 36 L42 46" fill="none" stroke={brand.colors.accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default BrandIcon;

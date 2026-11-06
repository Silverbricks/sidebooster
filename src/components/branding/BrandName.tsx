import { brand } from "@/config/brand";

/** The brand name as a styled wordmark: "Side" in ink, "Booster" in the primary colour. */
export function BrandName({ className, plain = false }: { className?: string; plain?: boolean }) {
  if (plain) return <span className={className}>{brand.name}</span>;
  return (
    <span className={className}>
      <span className="text-ink">Side</span>
      <span className="text-brand-600">Booster</span>
    </span>
  );
}

export default BrandName;

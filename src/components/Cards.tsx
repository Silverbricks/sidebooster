import Link from "next/link";
import type { Campaign, Category, Listing, ListingImage, CampaignImage } from "@prisma/client";
import { money, dateTime } from "@/lib/format";
import { publicStatus } from "@/lib/campaigns";
import { Progress, PublicStatusBadge } from "./ui";
import { productPath } from "@/lib/urls";

export function Thumb({ src, icon, alt, className = "aspect-[4/3]" }: { src?: string | null; icon?: string | null; alt: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`${className} w-full rounded-t-xl object-cover`} loading="lazy" />
  ) : (
    <div className={`${className} grid w-full place-items-center rounded-t-xl bg-gradient-to-br from-brand-50 to-slate-100 text-5xl`} aria-hidden="true">{icon ?? "📦"}</div>
  );
}

export function ListingCard({ l }: { l: Listing & { images: ListingImage[]; category: Category } }) {
  return (
    <Link href={productPath(l)} className="card group flex flex-col overflow-hidden transition hover:shadow-md">
      <Thumb src={l.images[0]?.url} icon={l.category.icon} alt={l.title} />
      <div className="flex flex-1 flex-col p-4">
        <div className="text-xs text-muted">{l.category.name} · {l.location}{l.state ? `, ${l.state}` : ""}</div>
        <div className="mt-1 line-clamp-2 font-semibold group-hover:text-brand-600">{l.title}</div>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-lg font-bold">{money(l.price)}</span>
          <span className="flex gap-1 text-[11px]">
            {l.condition === "NEW" && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">New</span>}
            {l.allowCheckout && !l.category.highValue && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">Buy now</span>}
            {l.status === "SOLD" && <span className="rounded bg-slate-200 px-1.5 py-0.5">Sold</span>}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CampaignCard({ c }: { c: Campaign & { images: CampaignImage[]; listing?: (Listing & { images: ListingImage[] }) | null } }) {
  const status = publicStatus(c);
  const img = c.images[0]?.url ?? c.listing?.images[0]?.url;
  return (
    <Link href={`/draws/${c.slug}`} className="card group flex flex-col overflow-hidden transition hover:shadow-md">
      <Thumb src={img} icon="🎟️" alt={c.prizeName} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <PublicStatusBadge status={status} />
          <span className="text-xs font-medium text-muted">{c.ticketType === "FREE" ? "Free entry" : `${money(c.ticketPrice)} / ticket`}</span>
        </div>
        <div className="font-semibold group-hover:text-brand-600">{c.title}</div>
        <div className="text-sm text-muted">Prize value {money(c.prizeValue)}</div>
        <div className="mt-auto space-y-1 pt-2">
          <Progress value={c.ticketsAllocated} max={c.totalTickets} />
          <div className="flex justify-between text-xs text-muted">
            <span>{c.ticketsAllocated.toLocaleString()} / {c.totalTickets.toLocaleString()} entries</span>
            <span>Draw {dateTime(c.drawAt, c.timezone)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

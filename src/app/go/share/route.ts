import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHARE_TARGETS, type ShareTarget } from "@/lib/social";
import { absoluteUrl, productPath, storePath, withUtm } from "@/lib/urls";
import { recordReferral } from "@/lib/referrals";
import { money } from "@/lib/format";
import { brand } from "@/config/brand";

export const dynamic = "force-dynamic";

/** Records a share click, then redirects to the platform's public share page with a UTM-tagged link. */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") as ShareTarget | null;
  const listingId = req.nextUrl.searchParams.get("l");
  const storeSlug = req.nextUrl.searchParams.get("s");
  if (!to || !(to in SHARE_TARGETS)) return NextResponse.json({ error: "Unknown share target" }, { status: 400 });

  let path: string | null = null;
  let text: string = brand.name;
  let image: string | undefined;
  let sellerId: string | null = null;
  if (listingId) {
    const l = await db.listing.findFirst({ where: { id: listingId, status: "ACTIVE" }, select: { id: true, slug: true, title: true, price: true, sellerId: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } });
    if (l) {
      path = productPath(l);
      text = `${l.title} – ${money(l.price)} on ${brand.name}`;
      image = l.images[0] ? absoluteUrl(l.images[0].url) : undefined;
      sellerId = l.sellerId;
    }
  } else if (storeSlug) {
    const sp = await db.sellerProfile.findFirst({ where: { storeSlug, status: { in: ["APPROVED", "ACTIVE"] } }, select: { storeSlug: true, sellerCode: true, businessName: true, userId: true, user: { select: { firstName: true } } } });
    if (sp) {
      path = storePath(sp);
      text = `${sp.businessName ?? `${sp.user.firstName}'s store`} on ${brand.name}`;
      sellerId = sp.userId;
    }
  }
  if (!path) return NextResponse.redirect(absoluteUrl("/"), 302);
  await recordReferral("SHARE", { source: to, medium: "social", campaign: "share" }, { listingId: listingId && path.startsWith("/product") ? listingId : null, sellerId, path });
  const target = SHARE_TARGETS[to].href(withUtm(absoluteUrl(path), to), text, image);
  return NextResponse.redirect(target, 302);
}

import { brand } from "@/config/brand";
import Link from "next/link";
import { notFound } from "next/navigation";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { bestOffer } from "@/lib/offers";
import { checkoutAction } from "@/app/actions/marketplace";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/ui";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(undefined, `/checkout/${id}`);
  const l = await db.listing.findUnique({ where: { id }, include: { category: true, images: { take: 1 } } });
  if (!l || l.status !== "ACTIVE" || !l.allowCheckout || l.category.highValue) notFound();

  const qty = Math.min(Math.max(1, Number(sp.qty) || 1), l.quantity);
  const coupon = sp.coupon?.trim() || null;
  const applied = await bestOffer(l, qty, user.id, coupon);
  const subtotal = l.price * qty;
  const delivery = applied?.freeDelivery ? 0 : l.deliveryFee;
  const discount = applied?.discount ?? 0;
  const total = subtotal - discount + delivery;
  const idem = crypto.randomUUID();

  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="h1">Checkout</h1>
      <div className="mt-6"><Flash sp={sp} /></div>
      {user.accountStatus !== "ACTIVE" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">Verify your email and mobile before purchasing. <Link href="/verify" className="link">Verify now</Link></div>
      )}
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <form method="get" className="card card-pad flex flex-wrap items-end gap-3">
            <div><label className="label" htmlFor="qty">Quantity</label><input id="qty" name="qty" type="number" min={1} max={l.quantity} defaultValue={qty} className="input w-24" /></div>
            <div className="flex-1"><label className="label" htmlFor="coupon">Coupon code</label><input id="coupon" name="coupon" defaultValue={coupon ?? ""} className="input uppercase" /></div>
            <button className="btn-secondary">Update</button>
          </form>
          <form action={checkoutAction} className="card card-pad space-y-4">
            <input type="hidden" name="listingId" value={l.id} />
            <input type="hidden" name="quantity" value={qty} />
            <input type="hidden" name="coupon" value={coupon ?? ""} />
            <input type="hidden" name="idempotencyKey" value={idem} />
            <h2 className="h2">Delivery details</h2>
            <div><label className="label" htmlFor="shippingName">Full name</label><input id="shippingName" name="shippingName" defaultValue={user.name} className="input" required /></div>
            <div><label className="label" htmlFor="shippingAddress">Delivery address</label><textarea id="shippingAddress" name="shippingAddress" rows={3} className="input" required placeholder="Street, suburb, state, postcode" /></div>
            <div><label className="label" htmlFor="notes">Notes for seller (optional)</label><input id="notes" name="notes" className="input" /></div>
            <SubmitButton className="btn-primary w-full">Continue to secure payment · {money(total)}</SubmitButton>
            <p className="text-xs text-muted">Your order is only confirmed once the payment provider confirms payment. Card details are entered on the payment provider&apos;s page, never stored by {brand.name}.</p>
          </form>
        </div>
        <aside className="card card-pad h-fit space-y-2 text-sm">
          <div className="font-semibold">{l.title}</div>
          <div className="flex justify-between"><span>{money(l.price)} × {qty}</span><span>{money(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-emerald-700"><span>{applied!.offer.name}</span><span>−{money(discount)}</span></div>}
          <div className="flex justify-between"><span>Delivery</span><span>{delivery ? money(delivery) : applied?.freeDelivery ? "Free" : "—"}</span></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total</span><span>{money(total)}</span></div>
          {coupon && !applied?.offer.couponCode && <p className="text-xs text-amber-700">Coupon “{coupon}” isn&apos;t valid for this order.</p>}
        </aside>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SALE_STATUS } from "@/lib/constants";
import { respondSaleAction } from "@/app/actions/marketplace";

export const metadata = { title: "Purchases to confirm" };

export default async function BuyerSalesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const sales = await db.sale.findMany({ where: { buyerId: user.id, source: "OFFLINE" }, include: { listing: true, seller: { select: { sellerProfile: { select: { sellerCode: true, businessName: true, legalName: true } } } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Purchases to confirm" subtitle="When you buy a car, property or other item arranged directly with a seller, they report the sale here for you to confirm." />
      <Flash sp={sp} />
      {sales.length ? (
        <div className="space-y-3">
          {sales.map((s) => (
            <div key={s.id} className="card card-pad text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/listing/${s.listingId}`} className="link font-medium">{s.listing.title}</Link>
                <Badge status={s.status} labels={SALE_STATUS} />
              </div>
              <div className="mt-1 text-muted">Seller {s.seller.sellerProfile?.businessName ?? s.seller.sellerProfile?.legalName} ({s.seller.sellerProfile?.sellerCode}) · reported {dateTime(s.createdAt)} · sale <span className="font-mono">{s.saleNumber}</span></div>
              <div className="mt-2 text-lg font-bold">Final sale price: {money(s.salePrice)}</div>
              {s.sellerNote && <p className="mt-1 text-muted">Seller note: {s.sellerNote}</p>}
              {s.status === "REPORTED" && (
                <form action={respondSaleAction} className="mt-3 flex gap-2">
                  <input type="hidden" name="saleId" value={s.id} />
                  <SubmitButton name="decision" value="confirm" className="btn-success">Yes, I bought this at this price</SubmitButton>
                  <SubmitButton name="decision" value="dispute" className="btn-secondary">This is not correct</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      ) : <Empty>Nothing to confirm.</Empty>}
    </div>
  );
}

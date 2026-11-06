import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { replyEnquiryAction } from "@/app/actions/seller";

export const metadata = { title: "Enquiries" };

export default async function SellerEnquiries({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const items = await db.enquiry.findMany({ where: { sellerId: user.id }, include: { listing: { select: { id: true, title: true } }, buyer: { select: { firstName: true, publicId: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  return (
    <div>
      <PageHeader title="Customer enquiries" />
      <Flash sp={sp} />
      {items.length ? (
        <div className="space-y-3">
          {items.map((e) => (
            <div key={e.id} className="card card-pad text-sm">
              <div className="flex items-center justify-between gap-2"><Link className="link font-medium" href={`/listing/${e.listing.id}`}>{e.listing.title}</Link><Badge status={e.status} /></div>
              <div className="mt-1 text-muted">{e.buyer.firstName} · Buyer ID <span className="font-mono">{e.buyer.publicId}</span> · {dateTime(e.createdAt)}</div>
              <p className="mt-2">{e.message}</p>
              {e.reply ? <p className="mt-2 rounded-lg bg-slate-50 p-3"><span className="text-muted">Your reply:</span> {e.reply}</p> : (
                <form action={replyEnquiryAction} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <input name="reply" className="input" placeholder="Write a reply…" required aria-label="Reply" />
                  <SubmitButton className="btn-primary">Reply</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      ) : <Empty>No enquiries yet.</Empty>}
    </div>
  );
}

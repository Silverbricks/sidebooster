import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "My enquiries" };

export default async function MyEnquiriesPage() {
  const user = await requireUser();
  const enquiries = await db.enquiry.findMany({ where: { buyerId: user.id }, include: { listing: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="My enquiries" />
      {enquiries.length ? (
        <div className="space-y-3">
          {enquiries.map((e) => (
            <div key={e.id} className="card card-pad text-sm">
              <div className="flex items-center justify-between"><Link href={`/listing/${e.listing.id}`} className="link font-medium">{e.listing.title}</Link><Badge status={e.status} /></div>
              <p className="mt-2"><span className="text-muted">You ({dateTime(e.createdAt)}):</span> {e.message}</p>
              {e.reply && <p className="mt-2 rounded-lg bg-slate-50 p-3"><span className="text-muted">Seller ({dateTime(e.repliedAt)}):</span> {e.reply}</p>}
            </div>
          ))}
        </div>
      ) : <Empty>No enquiries yet.</Empty>}
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { markAllReadAction } from "@/app/actions/account";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title="Notifications" actions={<form action={markAllReadAction}><SubmitButton className="btn-secondary btn-sm">Mark all read</SubmitButton></form>} />
      {items.length ? (
        <ul className="card divide-y divide-line">
          {items.map((n) => (
            <li key={n.id} className={`p-4 text-sm ${n.readAt ? "" : "bg-brand-50/50"}`}>
              <div className="flex justify-between gap-3"><span className="font-semibold">{!n.readAt && "● "}{n.title}</span><span className="shrink-0 text-xs text-muted">{dateTime(n.createdAt)}</span></div>
              <p className="mt-1 whitespace-pre-line text-slate-600">{n.body}</p>
              {n.link && <Link href={n.link} className="link mt-1 inline-block text-xs">Open →</Link>}
            </li>
          ))}
        </ul>
      ) : <Empty>No notifications.</Empty>}
    </div>
  );
}

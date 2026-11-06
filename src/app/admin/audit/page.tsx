import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.entity) where.entityType = sp.entity;
  if (sp.action) where.action = { contains: sp.action.toUpperCase(), mode: "insensitive" };
  if (sp.actor) where.actor = { publicId: sp.actor.toUpperCase() };
  const logs = await db.auditLog.findMany({ where, include: { actor: { select: { publicId: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  const entities = (await db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true } })).map((e) => e.entityType);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Approvals, financial actions and admin activity. Draw-specific actions are additionally recorded in each campaign's hash-chained draw log." />
      <form className="card card-pad mb-4 flex flex-wrap gap-3">
        <select name="entity" defaultValue={sp.entity ?? ""} className="input max-w-48" aria-label="Entity"><option value="">All entities</option>{entities.map((e) => <option key={e}>{e}</option>)}</select>
        <input name="action" defaultValue={sp.action} className="input max-w-48" placeholder="Action contains…" aria-label="Action" />
        <input name="actor" defaultValue={sp.actor} className="input max-w-40" placeholder="Actor ID" aria-label="Actor" />
        <button className="btn-secondary">Filter</button>
      </form>
      {logs.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th><th>Details</th></tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{dateTime(l.createdAt)}</td>
                <td className="font-mono text-xs">{l.actor?.publicId ?? "system"}</td>
                <td className="text-xs font-medium">{l.action}</td>
                <td className="text-xs">{l.entityType}<div className="font-mono text-muted">{l.entityId}</div></td>
                <td className="max-w-48 text-xs">{l.reason}</td>
                <td className="max-w-72 break-all font-mono text-[11px] text-muted">{l.details}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No entries.</Empty>}
    </div>
  );
}

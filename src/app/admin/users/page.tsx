import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ACCOUNT_STATUS } from "@/lib/constants";
import { userStatusAction, verifyIdentityAction } from "@/app/actions/admin";

export const metadata = { title: "Users" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const where: Prisma.UserWhereInput = {};
  if (sp.role) where.role = sp.role;
  if (sp.status) where.accountStatus = sp.status;
  if (sp.q) where.OR = [{ publicId: { contains: sp.q.toUpperCase(), mode: "insensitive" } }, { email: { contains: sp.q.toLowerCase(), mode: "insensitive" } }, { name: { contains: sp.q, mode: "insensitive" } }, { mobile: { contains: sp.q, mode: "insensitive" } }];
  const users = await db.user.findMany({ where, include: { sellerProfile: { select: { sellerCode: true, status: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const qs = new URLSearchParams(Object.entries(sp).filter(([k]) => !["ok", "error"].includes(k))).toString();
  const backTo = `/admin/users${qs ? `?${qs}` : ""}`;
  return (
    <div>
      <PageHeader title="Users" />
      <Flash sp={sp} />
      <form className="card card-pad mb-4 flex flex-wrap gap-3">
        <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="ID, email, name, mobile" aria-label="Search" />
        <select name="role" defaultValue={sp.role ?? ""} className="input max-w-40" aria-label="Role"><option value="">All roles</option><option>BUYER</option><option>SELLER</option><option>ADMIN</option></select>
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-52" aria-label="Status"><option value="">All statuses</option>{Object.entries(ACCOUNT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      {users.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>ID</th><th>Name / email</th><th>Role</th><th>Verification</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td className="font-mono text-xs">{u.publicId}{u.sellerProfile && <div>{u.sellerProfile.sellerCode}</div>}</td>
                <td>{u.name}<div className="text-xs text-muted">{u.email} · {u.mobile}</div><div className="text-xs text-muted">Joined {date(u.createdAt)} · {u.state ?? "—"}</div></td>
                <td>{u.role}</td>
                <td className="text-xs">Email {u.emailVerifiedAt ? "✅" : "⬜"} · Mobile {u.mobileVerifiedAt ? "✅" : "⬜"} · ID {u.idVerifiedAt ? "✅" : "⬜"}{u.riskFlags && <div className="text-red-700">⚠ {u.riskFlags}</div>}</td>
                <td><Badge status={u.accountStatus} labels={ACCOUNT_STATUS} />{u.statusReason && <div className="text-xs text-muted">{u.statusReason}</div>}</td>
                <td className="min-w-72 space-y-1">
                  {u.role !== "ADMIN" && (
                    <DecisionForm action={userStatusAction} name="status" hidden={{ id: u.id, back: backTo }} buttons={[
                      { value: "ACTIVE", label: "Activate" }, { value: "RESTRICTED", label: "Restrict" }, { value: "SUSPENDED", label: "Suspend", className: "btn-danger btn-sm" },
                    ]} reasonPlaceholder="Reason" />
                  )}
                  {!u.idVerifiedAt && u.role !== "ADMIN" && <form action={verifyIdentityAction}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="back" value={backTo} /><SubmitButton className="btn-secondary btn-sm">Mark ID verified</SubmitButton></form>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No users match.</Empty>}
    </div>
  );
}

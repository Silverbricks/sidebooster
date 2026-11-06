import { notFound, redirect } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { CampaignForm } from "@/components/CampaignForm";
import { Flash, PageHeader } from "@/components/ui";
import { saveCampaignAction } from "@/app/actions/seller";
import { campaignFormProps } from "@/lib/campaign-form-data";

export const metadata = { title: "Edit campaign" };

export default async function EditCampaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSeller();
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c || c.sellerId !== user.id) notFound();
  if (!["DRAFT", "REJECTED"].includes(c.status)) redirect(`/seller/campaigns/${id}`);
  return (
    <div>
      <PageHeader title={`Edit: ${c.title}`} />
      <Flash sp={sp} />
      {c.statusReason && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Reviewer feedback: {c.statusReason}</div>}
      <CampaignForm action={saveCampaignAction} c={c} {...await campaignFormProps(user)} />
    </div>
  );
}

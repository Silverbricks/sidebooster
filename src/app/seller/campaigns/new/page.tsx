import { requireSeller } from "@/lib/auth";
import { CampaignForm } from "@/components/CampaignForm";
import { Flash, PageHeader } from "@/components/ui";
import { saveCampaignAction } from "@/app/actions/seller";
import { campaignFormProps } from "@/lib/campaign-form-data";

export const metadata = { title: "Request a campaign" };

export default async function NewCampaign({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Request a promotion campaign" subtitle="Campaigns go through compliance review and admin approval before publishing. Dates you enter are proposals." />
      <Flash sp={sp} />
      <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Trade promotions and lotteries are regulated differently in each Australian state and territory. Some states (e.g. VIC, NSW) require trade promotions to be free to enter, and permits may be needed above certain prize values. SellEasy will not publish a campaign until its structure has been reviewed.
      </div>
      <CampaignForm action={saveCampaignAction} defaultListing={sp.listing} {...await campaignFormProps(user)} />
    </div>
  );
}

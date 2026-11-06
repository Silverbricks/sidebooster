import { requireSeller } from "@/lib/auth";
import { canSubmitListings } from "@/lib/accounts";
import { categoriesForForm } from "@/lib/listing-form-data";
import { ListingForm } from "@/components/ListingForm";
import { Flash, PageHeader } from "@/components/ui";
import { saveListingAction } from "@/app/actions/seller";

export const metadata = { title: "Add product" };

export default async function NewListing({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Add a product" subtitle="Every listing is reviewed before it's published." />
      <Flash sp={sp} />
      <ListingForm categories={await categoriesForForm()} action={saveListingAction} canSubmit={canSubmitListings(user)} initial={{ location: user.suburb ?? "", state: user.state, postcode: user.postcode, contactPhone: null }} />
    </div>
  );
}

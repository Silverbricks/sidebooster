import { MarketplaceView } from "@/components/MarketplaceView";

export const metadata = { title: "Marketplace", description: "Browse verified listings for cars, property, phones, electronics and more across Australia." };

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <MarketplaceView sp={await searchParams} />;
}

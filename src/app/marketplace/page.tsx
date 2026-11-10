import { MarketplaceView } from "@/components/MarketplaceView";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const filtered = Object.keys(await searchParams).some((k) => k !== "page");
  return {
    title: "Online Marketplace Australia – Buy Products Online",
    description: "Browse verified listings for cars, property, phones, electronics and more across Australia. Buy directly from local sellers.",
    alternates: { canonical: "/marketplace" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <MarketplaceView sp={await searchParams} />;
}

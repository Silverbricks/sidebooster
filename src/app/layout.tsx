import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { brand } from "@/config/brand";
import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";
import { ReferralCapture } from "@/components/ReferralCapture";
import { seoSettings } from "@/lib/seo";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

/** Site-wide defaults. Title/description and search-engine verification codes are editable in Admin → Settings → SEO. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await seoSettings();
  return {
    title: { default: seo.title, template: `%s · ${brand.name}` },
    description: seo.description,
    applicationName: brand.name,
    metadataBase: new URL(process.env.APP_URL ?? brand.url),
    openGraph: { type: "website", siteName: brand.name, title: seo.title, description: seo.description, locale: "en_AU" },
    twitter: { card: "summary_large_image", title: seo.title, description: seo.description },
    verification: {
      ...(seo.google ? { google: seo.google } : {}),
      ...(seo.bing ? { other: { "msvalidate.01": seo.bing } } : {}),
    },
  };
}

export const viewport = { themeColor: brand.colors.primary };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { gtm } = await seoSettings();
  return (
    <html lang="en-AU" className={inter.variable}>
      <body className="flex min-h-screen flex-col antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <FirebaseAnalytics />
        <ReferralCapture />
        {gtm && (
          <Script id="gtm" strategy="afterInteractive">{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}</Script>
        )}
      </body>
    </html>
  );
}

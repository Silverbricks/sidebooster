import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { brand } from "@/config/brand";
import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  metadataBase: new URL(process.env.APP_URL ?? brand.url),
  openGraph: { type: "website", siteName: brand.name, title: `${brand.name} — ${brand.tagline}`, description: brand.description, locale: "en_AU" },
  twitter: { card: "summary_large_image", title: `${brand.name} — ${brand.tagline}`, description: brand.description },
};

export const viewport = { themeColor: brand.colors.primary };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={inter.variable}>
      <body className="flex min-h-screen flex-col antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <FirebaseAnalytics />
      </body>
    </html>
  );
}

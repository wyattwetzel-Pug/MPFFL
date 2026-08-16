import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ConsentBanner } from "@/components/consent-banner";
import { RecordPageView } from "@/components/record-page-view";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/*
 * Share-preview defaults for the whole site. metadataBase makes every
 * page's OG URLs absolute; the root opengraph-image.tsx renders the
 * branded card; pages override title/description (the %s template keeps
 * the league name on every tab). iMessage, Twitter/X, Facebook, WhatsApp,
 * Slack and the rest all read these same tags.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://REPLACE-WITH-YOUR-DOMAIN.example"),
  title: {
    default: "MPFFL Fantasy Football League",
    template: "%s — MPFFL",
  },
  description:
    "Sixteen teams, salary caps, three-year contracts, and forty years of grudges. Est. 1987.",
  openGraph: {
    siteName: "MPFFL",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // v1 locked the site to dark mode; the class on <html> is the single switch.
  return (
    <html lang="en" className={`dark ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-[4.5rem] md:px-6">
          <RecordPageView />
          <ConsentBanner />
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { BRAND } from "@creatorlens/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.productName} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.productName}`,
  },
  description: BRAND.description,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://creatorlens.app"
  ),
  openGraph: {
    title: `${BRAND.productName} — ${BRAND.tagline}`,
    description: BRAND.description,
    siteName: BRAND.productName,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.productName} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}

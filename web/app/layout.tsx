import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { GraduationWatcher } from "@/components/GraduationWatcher";

// Disable static prerendering: every page in this app uses wagmi/RainbowKit hooks
// that rely on `indexedDB` and BigInt values, neither available during static export.
export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LitPump",
    template: "%s · LitPump",
  },
  description:
    "Permissionless memecoin launchpad on LitVM (Litecoin's Layer 2). Fair-launch bonding curves, instant trading, anti-snipe protection, creator fee share, graduate to DEX.",
  keywords: ["LitVM", "Litecoin", "zkLTC", "memecoin", "launchpad", "bonding curve", "pump.fun"],
  openGraph: {
    title: "LitPump",
    description:
      "Fair-launch memecoin platform on LitVM (Litecoin's Layer 2). Bonding curves, anti-snipe, creator-fee share.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "LitPump", description: "Fair-launch memecoins on LitVM." },
};

export const viewport: Viewport = {
  themeColor: "#08080d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="darkreader-lock" />
      </head>
      <body
        className="font-sans antialiased"
        suppressHydrationWarning
      >
        <Providers>
          <Header />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 min-h-[calc(100vh-12rem)]">
            {children}
          </main>
          <Footer />
          <GraduationWatcher />
        </Providers>
      </body>
    </html>
  );
}

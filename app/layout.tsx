import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { MODS_INIT_SCRIPT } from "@/lib/mods";
import "./globals.css";

// Two weights only, 400 and 500: hierarchy comes from size, color, and space.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ARO",
  description: "A coding workspace that reads your repo and pushes straight to GitHub.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    { media: "(prefers-color-scheme: light)", color: "#f1f1f3" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets the saved theme before first paint, so there is no flash of the wrong one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Same for the saved mods (accent, code colors, focus mode), which are CSS attributes on <html>. */}
        <script dangerouslySetInnerHTML={{ __html: MODS_INIT_SCRIPT }} />
      </head>
      <body className="flex h-full min-h-full bg-nimbus-chrome text-nimbus-text">
        <div id="nimbus-root">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
